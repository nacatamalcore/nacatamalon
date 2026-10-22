import { describe, expect, it } from 'bun:test';
import { renderSong, parseSongDoc, SONG_FORMAT, BUILTIN } from '../src';
import { analyzeAudio, mixSong, serializeSongDoc, songInstrumentNames, writeSongNotes } from '../src/authoring';
import { parseSongNotes } from '../src/audio/synth/parse_song_notes';
import type { TSongDoc } from '../src';

/**
 * What a note does on its own ([slide], [vib], [arp], [vol]), the instruments and samples the engine
 * has, and the dpcm voice, which plays samples at the console's grain. Measured in the sound.
 */

const RATE = 44100;
const FRAME = RATE / 60;

const song = (voices: TSongDoc['voices'], extra: Partial<TSongDoc> = {}): TSongDoc => ({
    format: SONG_FORMAT,
    tempo: 60,
    meter: [4, 4],
    voices,
    ...extra,
});

const peakIn = (track: Float32Array, from: number, to: number): number => {
    let peak = 0;
    for (let i = Math.round(from); i < Math.round(to); i += 1) peak = Math.max(peak, Math.abs(track[i]!));
    return peak;
};

const cyclesFrom = (track: Float32Array, from: number, count: number): number[] => {
    const rises: number[] = [];
    for (let i = Math.round(from) + 1; i < track.length && rises.length <= count; i += 1) {
        if (track[i - 1]! < 0 && track[i]! >= 0) rises.push(i);
    }
    return rises.slice(1).map((rise, k) => RATE / (rise - rises[k]!));
};

/** Where a track last sounds: the end of a sample that played to its end. */
const lastSound = (track: Float32Array): number => {
    for (let i = track.length - 1; i >= 0; i -= 1) if (track[i] !== 0) return i;
    return -1;
};

describe('what a note does on its own', () => {
    it('is read from the brackets after it, several at once', () => {
        const { notes, errors } = parseSongNotes("c4[slide] d[slide:0.1] e[vib] f[vib:5,0.5,0.2] g[arp:0,4,7] a[vol:8] b[vib][vol:10]", 'pulse1', [4, 4]);

        expect(errors).toEqual([]);
        expect(notes.map((note) => note.effects)).toEqual([
            { slide: 0.06 },
            { slide: 0.1 },
            { vibrato: { speed: 6, depth: 0.3 } },
            { vibrato: { speed: 5, depth: 0.5, delay: 0.2 } },
            { arpeggio: [0, 4, 7] },
            { volume: 8 },
            { vibrato: { speed: 6, depth: 0.3 }, volume: 10 },
        ]);
    });

    it('is a mistake said where it is: an unknown one, wrong numbers, on a rest, on the held part of a note', () => {
        const { errors } = parseSongNotes('c[wah] d[vol:20] e[arp] r[vol:3] f2~ f4[vib]', 'pulse1', [4, 4]);

        expect(errors.map((error) => [error.column, error.message.slice(0, 18)])).toEqual([
            [1, '[wah] is not somet'],
            [8, '[vol] is how loud,'],
            [18, '[arp] says the sem'],
            [25, "'r[vol:3]' is a re"],
            [38, "'f4[vib]' carries "],
        ]);
    });

    it('is written back after the note as the notes read it, the defaults left short', () => {
        const text = "c'4[slide] d'[vib:5,0.5] e'2~[arp:0,4,7] | e'4 f'[vol:8] g'2[slide:0.1][vib] |";
        const read = parseSongNotes(text, 'pulse1', [4, 4]);
        const written = writeSongNotes(read.notes, 'pulse1', [4, 4]);

        expect(parseSongNotes(written, 'pulse1', [4, 4]).notes).toEqual(read.notes);
        expect(written).toContain("c'[slide]");
        expect(written).toContain('[slide:0.1][vib]');
    });

    it('makes that one note quieter with [vol], and leaves the next one alone', () => {
        const rendered = renderSong(song({ pulse1: { notes: 'a4[vol:5] a4' } }));
        const track = rendered.voices.pulse1!;

        expect(peakIn(track, 0.3 * RATE, 0.7 * RATE) / peakIn(track, 1.3 * RATE, 1.7 * RATE)).toBeCloseTo(5 / 15, 2);
    });

    it('plays a chord one note a frame with [arp], over an instrument that has none', () => {
        const rendered = renderSong(song({ pulse1: { notes: '@pluck a1[arp:0,7]' } }));
        const track = rendered.voices.pulse1!;

        expect(cyclesFrom(track, 2 * FRAME + 30, 2)[1]).toBeCloseTo(440, -1);
        expect(cyclesFrom(track, 3 * FRAME + 30, 2)[1]).toBeCloseTo(440 * 2 ** (7 / 12), -1);
    });

    it('glides into that one note with [slide], and only into that one', () => {
        const rendered = renderSong(song({ triangle: { notes: 'a,4 a[slide:0.2] a,4 a' } }));
        const track = rendered.voices.triangle!;

        expect(cyclesFrom(track, RATE + 100, 2)[0]).toBeLessThan(300);
        expect(cyclesFrom(track, 3 * RATE + 100, 2)[0]).toBeCloseTo(440, -1);
    });
});

describe("the engine's instruments", () => {
    it('play by name with no instrument of the song, and the song’s own of that name is played instead', () => {
        const plain = renderSong(song({ noise: { notes: 'x4' } }));
        const kick = renderSong(song({ noise: { notes: '@kick x4' } }));
        const own = renderSong(song({ noise: { notes: '@kick x4' } }, { instruments: { kick: { volume: '15' } } }));
        const forced = renderSong(song({ noise: { notes: '@nacatamalon:kick x4' } }, { instruments: { kick: { volume: '15' } } }));

        expect(kick.errors).toEqual([]);
        expect(kick.voices.noise).not.toEqual(plain.voices.noise);
        expect(own.voices.noise).not.toEqual(kick.voices.noise);
        expect(forced.voices.noise).toEqual(kick.voices.noise);
    });

    it('are all readable, and every name the notes can say is offered', () => {
        for (const info of BUILTIN.MUSIC.INSTRUMENTS) {
            const rendered = renderSong(song({ [info.voices[0]!]: { notes: `@${info.key} c'4` } }));
            expect([info.key, rendered.errors, rendered.instrumentErrors]).toEqual([info.key, [], []]);
        }
        const names = songInstrumentNames({ kick: {}, mine: {} });
        expect(names.slice(0, 2)).toEqual(['kick', 'mine']);
        expect(names.filter((name) => name === 'kick')).toHaveLength(1);
        expect(names).toContain('lead');
        expect(names).toContain('nacatamalon:kick');
    });
});

describe('the dpcm voice', () => {
    it('plays the engine’s samples at the console’s grain: the level moves two steps of 128 at a time', () => {
        const rendered = renderSong(song({ dpcm: { notes: "@drum-kick c'4" } }));
        const track = rendered.voices.dpcm!;
        const levels = new Set<number>();
        for (let i = 0; i < RATE * 0.2; i += 1) if (track[i] !== 0) levels.add(Math.round(track[i]! * 1e6));

        expect(rendered.errors).toEqual([]);
        expect(peakIn(track, 0, 0.1 * RATE)).toBeGreaterThan(0.05);
        expect(levels.size).toBeGreaterThan(10);
    });

    it('plays a lower note slower and deeper, so the sample lasts longer', () => {
        const high = renderSong(song({ dpcm: { notes: "@drum-tom c'1" } }));
        const low = renderSong(song({ dpcm: { notes: '@drum-tom c1' } }));

        expect(lastSound(low.voices.dpcm!) / lastSound(high.voices.dpcm!)).toBeGreaterThan(1.6);
    });

    it('plays the sample once, and stops it where the note ends', () => {
        const short = renderSong(song({ dpcm: { notes: "@drum-tom c'16 r8. r2." } }));

        expect(lastSound(short.voices.dpcm!)).toBeLessThan(0.25 * RATE + 2);
    });

    it('plays a sound of the game given to it, by the name its instrument says', () => {
        const tone = new Float32Array(22050).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / 22050) * 0.8);
        const doc = song({ dpcm: { notes: "@hit c'4" } }, { instruments: { hit: { sample: '/samples/hit.wav' } } });
        const given = renderSong(doc, RATE, { samples: new Map([['/samples/hit.wav', { samples: tone, sampleRate: 22050 }]]) });
        const missing = renderSong(doc);

        expect(given.instrumentErrors).toEqual([]);
        expect(peakIn(given.voices.dpcm!, 0, 0.5 * RATE)).toBeGreaterThan(0.05);
        expect(missing.instrumentErrors).toEqual([{ instrument: 'hit', field: 'sample', message: expect.stringContaining('was not loaded') }]);
        expect(peakIn(missing.voices.dpcm!, 0, RATE)).toBe(0);
    });

    it('is a mistake with no instrument, or an instrument with no sample', () => {
        const none = renderSong(song({ dpcm: { notes: "c'4" } }));
        const noSample = renderSong(song({ dpcm: { notes: "@lead c'4" } }));

        expect(none.errors).toEqual([{ voice: 'dpcm', line: 1, column: 1, message: expect.stringContaining('plays samples') }]);
        expect(noSample.instrumentErrors).toEqual([{ instrument: 'lead', field: 'sample', message: expect.stringContaining('no "sample"') }]);
    });

    it('is not moved by a change of key, as the drums are not', () => {
        const doc = song({ dpcm: { notes: "@drum-kick c'4" } });

        expect(renderSong(doc, RATE, { transpose: 5 }).voices.dpcm).toEqual(renderSong(doc).voices.dpcm);
    });

    it('brings the other voices down a little, so all five at full volume never distort', () => {
        const four = { pulse1: { notes: 'a1' }, pulse2: { notes: 'e1' }, triangle: { notes: 'a,1' }, noise: { notes: 'x1' } };
        const alone = renderSong(song(four));
        const withDpcm = renderSong(song({ ...four, dpcm: { notes: '@orch-hit c\'4 @drum-kick c\' @drum-snare c\' @drum-clap c\'' } }));

        expect(peakIn(withDpcm.voices.pulse1!, 0, RATE) / peakIn(alone.voices.pulse1!, 0, RATE)).toBeLessThan(0.9);
        expect(analyzeAudio(mixSong(withDpcm), RATE).clipped).toBe(0);
    });

    it('has every sample the engine lists', () => {
        for (const sample of BUILTIN.MUSIC.SAMPLES) {
            const rendered = renderSong(song({ dpcm: { notes: "@x c'4" } }, { instruments: { x: { sample: `nacatamalon:${sample.key}` } } }));
            expect([sample.key, rendered.instrumentErrors]).toEqual([sample.key, []]);
            expect(peakIn(rendered.voices.dpcm!, 0, RATE)).toBeGreaterThan(0.02);
        }
    });
});

describe('a .song file with samples', () => {
    it('keeps an instrument’s sample, and a voice may start with one of the engine’s instruments', () => {
        const file: TSongDoc = song(
            { dpcm: { notes: "c'4 @hit c' |", instrument: 'drum-kick' }, pulse1: { notes: "c'4[vib] d'[vol:8] |" } },
            { instruments: { hit: { sample: '/samples/hit.wav' } } },
        );

        expect(parseSongDoc(JSON.parse(serializeSongDoc(file)), 'test.song')).toEqual(file);
        expect(() => parseSongDoc({ tempo: 60, voices: {}, instruments: { hit: { sample: 3 } } }, 'test.song')).toThrow(/"sample" of the instrument "hit"/);
    });
});
