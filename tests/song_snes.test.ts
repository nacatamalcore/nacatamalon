import { describe, expect, it } from 'bun:test';
import { renderSong, parseSongDoc, SONG_FORMAT, BUILTIN } from '../src';
import { mixSong, serializeSongDoc } from '../src/authoring';
import { toSnes, SNES_RATE } from '../src/audio/synth/snes';
import type { TSongDoc } from '../src';

/**
 * The SNES: eight voices of samples, with the console's grain, envelopes and echo. Measured in the
 * sound.
 */

const RATE = 44100;

const song = (voices: TSongDoc['voices'], extra: Partial<TSongDoc> = {}): TSongDoc => ({
    format: SONG_FORMAT,
    chip: 'snes',
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

/** The strongest frequency near `hz`, from how much of each one a stretch holds. */
const strongestNear = (track: Float32Array, from: number, hz: number): number => {
    let best = 0;
    let bestPower = -1;
    for (let f = hz * 0.9; f <= hz * 1.1; f += 0.5) {
        let re = 0;
        let im = 0;
        for (let i = 0; i < 8192; i += 1) {
            const x = track[from + i]!;
            re += x * Math.cos((2 * Math.PI * f * i) / RATE);
            im += x * Math.sin((2 * Math.PI * f * i) / RATE);
        }
        const power = re * re + im * im;
        if (power > bestPower) {
            bestPower = power;
            best = f;
        }
    }
    return best;
};

describe('a SNES voice', () => {
    it('plays its sample at the note asked, the sample knowing the note it is', () => {
        const rendered = renderSong(song({ s1: { notes: '@strings c1 | a1 |' } }));
        const track = rendered.voices.s1!;

        expect(rendered.errors).toEqual([]);
        expect(strongestNear(track, RATE, 261.6)).toBeCloseTo(261.6, -0.5);
        expect(strongestNear(track, 5 * RATE, 440)).toBeCloseTo(440, -0.5);
    });

    it('holds a looped sample for as long as the note lasts, and lets a struck one die away', () => {
        const rendered = renderSong(song({ s1: { notes: '@strings c1 |' }, s2: { notes: '@piano c1 |' } }));

        expect(peakIn(rendered.voices.s1!, 3.5 * RATE, 3.9 * RATE)).toBeGreaterThan(0.05);
        expect(peakIn(rendered.voices.s2!, 3.5 * RATE, 3.9 * RATE)).toBeLessThan(peakIn(rendered.voices.s2!, 0.1 * RATE, 0.3 * RATE) / 5);
    });

    it('comes in and dies away by its envelope, ringing on after the note until the next one', () => {
        const doc = song({ s1: { notes: '@pad c4 r4 c4 c4 |' } }, { instruments: { pad: { sample: 'nacatamalon:organ', adsr: { attack: 0.5, release: 0.4 } } } });
        const track = renderSong(doc).voices.s1!;

        expect(peakIn(track, 0, 0.05 * RATE)).toBeLessThan(peakIn(track, 0.6 * RATE, 0.9 * RATE) / 4);
        // After the first note, in the rest: still there, then gone.
        expect(peakIn(track, 1.05 * RATE, 1.15 * RATE)).toBeGreaterThan(0.01);
        expect(peakIn(track, 1.5 * RATE, 1.95 * RATE)).toBe(0);
    });

    it('has the console\'s grain: BRR keeps a sample close but not the same', () => {
        const tone = new Float32Array(SNES_RATE).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / SNES_RATE) * 0.8);
        const made = toSnes({ samples: tone, sampleRate: SNES_RATE });
        let error = 0;
        for (let i = 0; i < tone.length; i += 1) error = Math.max(error, Math.abs(made.data[i]! - tone[i]!));

        expect(error).toBeGreaterThan(0);
        expect(error).toBeLessThan(0.05);
    });

    it('needs an instrument with a sample, said where', () => {
        expect(renderSong(song({ s1: { notes: 'c4' } })).errors[0]!.message).toContain('SNES voice, which plays samples');
        expect(renderSong(song({ s1: { notes: '@lead c4' } })).instrumentErrors[0]).toMatchObject({ instrument: 'lead', field: 'sample' });
    });
});

describe('the echo', () => {
    const doc = song({ s1: { notes: '@ping c16 r8. r2. | r1 |' } }, {
        instruments: { ping: { sample: 'nacatamalon:marimba', echo: true } },
        echo: { delay: 0.24, feedback: 0.5, volume: 0.5 },
    });

    it('plays what goes into it again, later, a track of its own', () => {
        const rendered = renderSong(doc);
        const echo = rendered.echo!;

        // Nothing yet but the last of its own tail, carried round from the end.
        expect(peakIn(echo, 0, 0.2 * RATE)).toBeLessThan(1e-6);
        expect(peakIn(echo, 0.24 * RATE, 0.4 * RATE)).toBeGreaterThan(0.01);
        // And again, quieter, as it comes round.
        expect(peakIn(echo, 0.48 * RATE, 0.64 * RATE)).toBeLessThan(peakIn(echo, 0.24 * RATE, 0.4 * RATE));
        expect(mixSong(rendered).length).toBe(rendered.length);
    });

    it('is only there when an instrument goes into it', () => {
        expect(renderSong(song({ s1: { notes: '@marimba c4' } })).echo).toBeUndefined();
    });

    it('carries what it plays past the end round to where the loop starts', () => {
        const late = song({ s1: { notes: 'r1 | r2. @ping c4 |' } }, { instruments: { ping: { sample: 'nacatamalon:organ', echo: true } }, echo: { delay: 0.24, volume: 0.5 } });
        const echo = renderSong(late).echo!;

        expect(peakIn(echo, 0, 0.2 * RATE)).toBeGreaterThan(0.01);
    });
});

describe('a SNES song file', () => {
    it('keeps its chip, its echo and its instruments\' envelopes, and refuses a voice the console does not have', () => {
        const file = song({ s1: { notes: "@pad c'1 |" } }, {
            echo: { delay: 0.1, feedback: 0.3, volume: 0.2, filter: [0.5, 0.3, 0.2, 0, 0, 0, 0, 0] },
            instruments: { pad: { sample: '/samples/pad.wav', root: 62, loop: 0.5, adsr: { attack: 0.2, release: 0.5 }, echo: true } },
        });

        expect(parseSongDoc(JSON.parse(serializeSongDoc(file)), 'pad.song')).toEqual(file);
        expect(() => parseSongDoc({ chip: 'snes', tempo: 60, voices: { pulse1: { notes: 'c' } } }, 'x.song')).toThrow(/no voice called "pulse1" on the snes/);
        expect(() => parseSongDoc({ chip: 'n64', tempo: 60, voices: {} }, 'x.song')).toThrow(/"chip" is the console/);
    });

    it("plays every one of the engine's instruments meant for it", () => {
        for (const info of BUILTIN.MUSIC.INSTRUMENTS.filter((candidate) => candidate.voices.includes('s1'))) {
            const rendered = renderSong(song({ s1: { notes: `@${info.key} c'4` } }));
            expect([info.key, rendered.errors, rendered.instrumentErrors]).toEqual([info.key, [], []]);
            expect(peakIn(rendered.voices.s1!, 0, RATE)).toBeGreaterThan(0.01);
        }
    });
});
