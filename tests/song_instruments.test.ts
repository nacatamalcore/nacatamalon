import { describe, expect, it } from 'bun:test';
import { renderSong, parseSongDoc, SONG_FORMAT } from '../src';
import { serializeSongDoc, songInstrumentErrors, writeSongNotes } from '../src/authoring';
import { parseSongNotes } from '../src/audio/synth/parse_song_notes';
import type { TSongDoc, TSongInstrument } from '../src';

/**
 * Instruments: how a note sounds over its life, as lists of numbers read one a frame, a sixtieth of a
 * second. What these check is measured in the sound itself, since nobody can listen to a test.
 */

const RATE = 44100;
const FRAME = RATE / 60;

const song = (voices: TSongDoc['voices'], instruments: Record<string, TSongInstrument>, extra: Partial<TSongDoc> = {}): TSongDoc => ({
    format: SONG_FORMAT,
    tempo: 60,
    meter: [4, 4],
    voices,
    instruments,
    ...extra,
});

/** How loud a track gets over a stretch. */
const peakIn = (track: Float32Array, from: number, to: number): number => {
    let peak = 0;
    for (let i = Math.round(from); i < Math.round(to); i += 1) peak = Math.max(peak, Math.abs(track[i]!));
    return peak;
};

/** The frequency of each whole cycle from `from`, measured between rises through zero. */
const cyclesFrom = (track: Float32Array, from: number, count: number): number[] => {
    const rises: number[] = [];
    for (let i = Math.round(from) + 1; i < track.length && rises.length <= count; i += 1) {
        if (track[i - 1]! < 0 && track[i]! >= 0) rises.push(i);
    }
    return rises.slice(1).map((rise, k) => RATE / (rise - rises[k]!));
};

/** The frequency over a stretch, from how many times it rises through zero. */
const frequencyIn = (track: Float32Array, from: number, to: number): number => {
    let rises = 0;
    for (let i = Math.round(from) + 1; i < Math.round(to); i += 1) if (track[i - 1]! < 0 && track[i]! >= 0) rises += 1;
    return rises / ((to - from) / RATE);
};

describe('an instrument list', () => {
    it('is read one number a frame, and keeps its last number once it runs out', () => {
        const rendered = renderSong(song({ pulse1: { notes: 'a1', instrument: 'pluck' } }, { pluck: { volume: '15 10 5' } }));
        const track = rendered.voices.pulse1!;
        const frames = [0, 1, 2, 3, 30].map((f) => peakIn(track, f * FRAME + 50, (f + 1) * FRAME));

        expect(frames[1]! / frames[0]!).toBeCloseTo(10 / 15, 2);
        expect(frames[2]! / frames[0]!).toBeCloseTo(5 / 15, 2);
        expect(frames[3]).toBeCloseTo(frames[2]!, 3);
        expect(frames[4]).toBeCloseTo(frames[2]!, 3);
    });

    it('starts again from its | for as long as the note lasts', () => {
        const rendered = renderSong(song({ pulse1: { notes: 'a1', instrument: 'pulse' } }, { pulse: { volume: '15 | 4 12' } }));
        const track = rendered.voices.pulse1!;
        const frames = [1, 2, 3, 4, 41, 42].map((f) => peakIn(track, f * FRAME + 50, (f + 1) * FRAME - 50));

        // Frames 1 and 2 are 4 and 12, and from there it goes round those two: frame 41 is a 4.
        expect(frames.map((peak) => Math.round((peak / frames[0]!) * 4))).toEqual([4, 12, 4, 12, 4, 12]);
    });

    it('plays a chord one note a frame as an arpeggio', () => {
        // a is 440 Hz; a major chord adds 4 and 7 semitones, round and round.
        const rendered = renderSong(song({ pulse1: { notes: 'a1', instrument: 'chord' } }, { chord: { arpeggio: '| 0 4 7' } }));
        const track = rendered.voices.pulse1!;
        const heard = [3, 4, 5].map((f) => cyclesFrom(track, f * FRAME + 30, 3)[1]!);

        expect(heard[0]).toBeCloseTo(440, -1);
        expect(heard[1]).toBeCloseTo(440 * 2 ** (4 / 12), -1);
        expect(heard[2]).toBeCloseTo(440 * 2 ** (7 / 12), -1);
    });

    it('changes the colour of a square wave by its duty', () => {
        const rendered = renderSong(song({ pulse1: { notes: 'a1', instrument: 'thin' } }, { thin: { duty: '0' } }));
        const track = rendered.voices.pulse1!;
        let up = 0;
        const from = RATE / 2;
        for (let i = from; i < from + RATE / 10; i += 1) if (track[i]! > 0) up += 1;

        expect(up / (RATE / 10)).toBeCloseTo(0.125, 1);
    });
});

describe('vibrato and slide', () => {
    it('wobbles the pitch, only after its delay', () => {
        const rendered = renderSong(song({ pulse1: { notes: 'a1', instrument: 'sung' } }, { sung: { vibrato: { speed: 4, depth: 1, delay: 0.5 } } }));
        const track = rendered.voices.pulse1!;
        const before = cyclesFrom(track, 0.1 * RATE, 40);
        const after = cyclesFrom(track, 1 * RATE, 400);

        // A cycle is a whole number of samples, so one measured alone is only good to about 4 Hz here.
        expect(Math.max(...before) - Math.min(...before)).toBeLessThan(6);
        expect(Math.max(...after)).toBeGreaterThan(440 * 2 ** (0.8 / 12));
        expect(Math.min(...after)).toBeLessThan(440 * 2 ** (-0.8 / 12));
    });

    it('glides from the note before in the same voice, and the first note does not', () => {
        const rendered = renderSong(song({ triangle: { notes: 'a,4 a', instrument: 'bass' } }, { bass: { slide: 0.1 } }));
        const track = rendered.voices.triangle!;
        const first = cyclesFrom(track, 0.01 * RATE, 3);
        const glide = cyclesFrom(track, RATE, 10);

        expect(first[0]).toBeCloseTo(220, -1);
        expect(glide[0]).toBeLessThan(300);
        expect(frequencyIn(track, 1.3 * RATE, 1.9 * RATE)).toBeCloseTo(440, -1);
    });

    it('bends a drum by its pitch list, the noise rumbling lower', () => {
        const rendered = renderSong(song({ noise: { notes: '@kick x4 @hat x' } }, { kick: { pitch: '-30' }, hat: { pitch: '20' } }));
        const track = rendered.voices.noise!;
        const flips = (from: number) => {
            let count = 0;
            for (let i = from + 1; i < from + FRAME; i += 1) if (Math.sign(track[i]!) !== Math.sign(track[i - 1]!)) count += 1;
            return count;
        };

        expect(flips(0)).toBeLessThan(flips(RATE));
    });
});

describe('@ in the notes', () => {
    it('changes the instrument from there on, and @- goes back to none', () => {
        const { notes } = parseSongNotes('c @a d e @b f @- g', 'pulse1', [4, 4], { first: 'start', names: ['start', 'a', 'b'] });

        expect(notes.map((note) => note.instrument)).toEqual(['start', 'a', 'a', 'b', undefined]);
    });

    it('is a mistake when the song has no instrument of that name, said where it is', () => {
        const { errors, notes } = parseSongNotes('c @lead d', 'pulse1', [4, 4], { names: ['bass'] });

        expect(errors).toEqual([{ voice: 'pulse1', line: 1, column: 3, message: expect.stringContaining("'bass'") }]);
        expect(notes.every((note) => note.instrument === undefined)).toBe(true);
    });

    it('leaves a song with no instruments sounding as it did', () => {
        const voices = { pulse1: { notes: "c'8 e g c'' | r2 a4 b |" }, triangle: { notes: 'c,2 g, |' }, noise: { notes: 'x8 x x4 r2 |' } };
        const plain = renderSong({ format: SONG_FORMAT, tempo: 120, meter: [4, 4], voices });
        const unused = renderSong({ format: SONG_FORMAT, tempo: 120, meter: [4, 4], voices, instruments: { lead: { volume: '3' } } });

        expect(unused.voices).toEqual(plain.voices);
    });
});

describe('a mistake in an instrument', () => {
    it('is said with the instrument, the field and the word, and the rest still plays', () => {
        const rendered = renderSong(song({ pulse1: { notes: 'a1', instrument: 'lead' } }, {
            lead: { volume: '15 loud 20 | 9 |', duty: '1 5', vibrato: { speed: -1, depth: 1 } },
        }));

        expect(rendered.instrumentErrors).toEqual([
            { instrument: 'lead', field: 'vibrato', message: expect.any(String) },
            { instrument: 'lead', field: 'volume', position: 2, message: "'loud' is not a number." },
            { instrument: 'lead', field: 'volume', position: 3, message: expect.stringContaining('from 0') },
            { instrument: 'lead', field: 'volume', position: 6, message: expect.stringContaining('one |') },
            { instrument: 'lead', field: 'duty', position: 2, message: expect.stringContaining('0, 1, 2 or 3') },
        ]);
        expect(peakIn(rendered.voices.pulse1!, 0.5 * RATE, 0.6 * RATE)).toBeGreaterThan(0);
    });

    it('is found without making the sound, the same as renderSong finds it', () => {
        const doc = song({ pulse1: { notes: 'a1', instrument: 'lead' } }, { lead: { volume: '15 x', slide: -1 } });

        expect(songInstrumentErrors(doc)).toEqual(renderSong(doc).instrumentErrors);
        expect(songInstrumentErrors(doc).map((error) => error.field)).toEqual(['slide', 'volume']);
    });

    it('is a list with nothing after its |', () => {
        const rendered = renderSong(song({ pulse1: { notes: 'a1', instrument: 'lead' } }, { lead: { arpeggio: '0 4 |' } }));

        expect(rendered.instrumentErrors).toEqual([{ instrument: 'lead', field: 'arpeggio', position: 3, message: expect.stringContaining('nothing comes after') }]);
    });
});

describe('a .song file with instruments', () => {
    const file: TSongDoc = {
        format: SONG_FORMAT,
        tempo: 140,
        meter: [4, 4],
        loop: { bar: 2 },
        instruments: {
            lead: { volume: '15 13 | 11', duty: '0 1', vibrato: { speed: 6, depth: 0.25, delay: 0.2 } },
            bass: { slide: 0.03 },
            kick: { volume: '15 8 0', pitch: '0 -8' },
        },
        voices: {
            pulse1: { notes: "c'4 d' e' f' | @- g'1 |", instrument: 'lead' },
            triangle: { notes: 'c,1 | @bass c1 |' },
            noise: { notes: '@kick x4 x x x | x1 |' },
        },
    };

    it('is read back the same as it was written', () => {
        expect(parseSongDoc(JSON.parse(serializeSongDoc(file)), 'test.song')).toEqual(file);
    });

    it('refuses an instrument that cannot be one, naming the file', () => {
        expect(() => parseSongDoc({ tempo: 120, voices: {}, instruments: { lead: { volume: [15, 12] } } }, 'theme.song'))
            .toThrow(/theme\.song.*"volume" of the instrument "lead"/);
        expect(() => parseSongDoc({ tempo: 120, voices: {}, instruments: { lead: { loudness: '15' } } }, 'theme.song'))
            .toThrow(/"lead" has "loudness"/);
        expect(() => parseSongDoc({ tempo: 120, voices: {}, instruments: { 'my lead': {} } }, 'theme.song'))
            .toThrow(/"my lead" cannot be an instrument's name/);
    });

    it('refuses a voice that starts with an instrument the song does not have', () => {
        expect(() => parseSongDoc({ tempo: 120, voices: { pulse1: { notes: 'c', instrument: 'kazoo' } } }, 'theme.song'))
            .toThrow(/theme\.song.*"pulse1" starts with the instrument "kazoo"/);
        // One of the engine's is fine with no instruments of its own.
        expect(parseSongDoc({ tempo: 120, voices: { pulse1: { notes: 'c', instrument: 'lead' } } }, 'theme.song').voices.pulse1!.instrument).toBe('lead');
    });
});

describe('writing notes back', () => {
    it('keeps where the instrument changes, and reads back the same notes', () => {
        const text = "c' d' @b e' f' | @- g'1 |";
        const read = parseSongNotes(text, 'pulse1', [4, 4], { first: 'a' });
        const written = writeSongNotes(read.notes, 'pulse1', [4, 4], { first: 'a' });

        expect(written).toBe(text);
        expect(parseSongNotes(written, 'pulse1', [4, 4], { first: 'a' }).notes).toEqual(read.notes);
    });

    it('says the instrument of a voice that starts with none when its first note has one', () => {
        const read = parseSongNotes('c @lead d e f |', 'pulse1', [4, 4]);

        expect(writeSongNotes(read.notes, 'pulse1', [4, 4])).toBe('c @lead d e f |');
    });
});
