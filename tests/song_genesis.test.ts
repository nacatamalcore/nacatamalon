import { describe, expect, it } from 'bun:test';
import { renderSong, parseSongDoc, SONG_FORMAT, BUILTIN } from '../src';
import { serializeSongDoc } from '../src/authoring';
import { psgFrequencyOf, psgGainOf } from '../src/audio/synth/genesis';
import type { TFmPatch, TSongDoc } from '../src';

/**
 * The Genesis: six FM voices of four operators each, and the squares and noise of its second chip.
 * Measured in the sound.
 */

const RATE = 44100;

const song = (voices: TSongDoc['voices'], extra: Partial<TSongDoc> = {}): TSongDoc => ({
    format: SONG_FORMAT,
    chip: 'genesis',
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

/** How much of a frequency a stretch holds. */
const powerAt = (track: Float32Array, from: number, hz: number): number => {
    let re = 0;
    let im = 0;
    for (let i = 0; i < 8192; i += 1) {
        re += track[from + i]! * Math.cos((2 * Math.PI * hz * i) / RATE);
        im += track[from + i]! * Math.sin((2 * Math.PI * hz * i) / RATE);
    }
    return Math.sqrt(re * re + im * im);
};

const SINE: TFmPatch = { algorithm: 7, operators: [{ level: 1 }, { level: 0 }, { level: 0 }, { level: 0 }] };

describe('an FM voice', () => {
    it('plays the note asked, an operator alone being a sine at it', () => {
        const rendered = renderSong(song({ fm1: { notes: '@sine a1 |' } }, { instruments: { sine: { fm: SINE } } }));
        const track = rendered.voices.fm1!;

        expect(rendered.errors).toEqual([]);
        expect(powerAt(track, RATE, 440)).toBeGreaterThan(powerAt(track, RATE, 880) * 20);
    });

    it('is brighter when one operator bends another, and brighter still when the first bends itself', () => {
        const bent: TFmPatch = { algorithm: 0, operators: [{ level: 0.6 }, { level: 0 }, { level: 0 }, { level: 1 }] };
        const plain = renderSong(song({ fm1: { notes: '@x a1 |' } }, { instruments: { x: { fm: { algorithm: 0, operators: [{ level: 0 }, { level: 0 }, { level: 0 }, { level: 1 }] } } } })).voices.fm1!;
        const twice = renderSong(song({ fm1: { notes: '@x a1 |' } }, { instruments: { x: { fm: { ...bent, algorithm: 0 } } } })).voices.fm1!;
        const harmonics = (track: Float32Array) => [880, 1320, 1760].reduce((sum, hz) => sum + powerAt(track, RATE, hz), 0);

        // Through the chain 1, 2, 3, 4 the first does not reach the fourth when the two between are off.
        expect(harmonics(twice)).toBeCloseTo(harmonics(plain), 0);
        const direct = renderSong(song({ fm1: { notes: '@x a1 |' } }, { instruments: { x: { fm: { algorithm: 2, operators: [{ level: 0.6 }, { level: 0 }, { level: 0 }, { level: 1 }] } } } })).voices.fm1!;
        expect(harmonics(direct)).toBeGreaterThan(harmonics(plain) * 5);
        const gritty = renderSong(song({ fm1: { notes: '@x a1 |' } }, { instruments: { x: { fm: { algorithm: 7, feedback: 6, operators: [{ level: 1 }, { level: 0 }, { level: 0 }, { level: 0 }] } } } })).voices.fm1!;
        expect(harmonics(gritty)).toBeGreaterThan(harmonics(plain) * 5);
    });

    it('rings on by its envelopes after the note, until the next one', () => {
        const doc = song({ fm1: { notes: '@ring a4 r2. |' } }, {
            instruments: { ring: { fm: { algorithm: 7, operators: [{ level: 1, release: 0.5 }, { level: 0 }, { level: 0 }, { level: 0 }] } } },
        });
        const track = renderSong(doc).voices.fm1!;

        expect(peakIn(track, 1.1 * RATE, 1.2 * RATE)).toBeGreaterThan(0.01);
        expect(peakIn(track, 1.6 * RATE, 2 * RATE)).toBe(0);
    });

    it('comes out in nine bits', () => {
        const track = renderSong(song({ fm1: { notes: '@sine a1 |', volume: 1 } }, { instruments: { sine: { fm: SINE } } })).voices.fm1!;
        const steps = new Set<number>();
        for (let i = RATE; i < RATE + 2000; i += 1) steps.add(Math.round(track[i]! * 1e6));
        expect(steps.size).toBeLessThan(520);
    });

    it('needs an instrument with an fm, said where', () => {
        expect(renderSong(song({ fm1: { notes: 'c4' } })).errors[0]!.message).toContain('FM voice');
        expect(renderSong(song({ fm1: { notes: '@lead c4' } })).instrumentErrors[0]).toMatchObject({ instrument: 'lead', field: 'fm' });
        expect(renderSong(song({ fm1: { notes: '@x c4' } }, { instruments: { x: { fm: { algorithm: 9, operators: [{}, {}, {}, { sustain: 2 }] } } } })).instrumentErrors.map((e) => e.field)).toEqual(['fm', 'fm']);
    });
});

describe('the second chip', () => {
    it('plays its high notes a little off, as its divider does', () => {
        expect(psgFrequencyOf(440)).toBeCloseTo(440, -0.5);
        expect(Math.abs(psgFrequencyOf(4186) - 4186)).toBeGreaterThan(10);
    });

    it('steps its volume two decibels at a time', () => {
        expect(psgGainOf(15)).toBe(1);
        expect(20 * Math.log10(psgGainOf(14))).toBeCloseTo(-2, 5);
        expect(psgGainOf(0)).toBe(0);
    });

    it('plays squares with or without an instrument, and drums on its noise', () => {
        const rendered = renderSong(song({ psg1: { notes: 'a4' }, psg2: { notes: '@pluck a4' }, psgNoise: { notes: '@kick x4 @snare x' } }));

        expect(rendered.errors).toEqual([]);
        expect(peakIn(rendered.voices.psg1!, 0, RATE)).toBeGreaterThan(0.01);
        expect(peakIn(rendered.voices.psgNoise!, 0, RATE)).toBeGreaterThan(0.01);
    });
});

describe('a Genesis song file', () => {
    it('keeps its instruments\' operators', () => {
        const file = song({ fm1: { notes: "@bell c'1 |" } }, {
            instruments: { bell: { fm: { algorithm: 4, feedback: 2, operators: [{ multiple: 3.5, level: 0.6, decay: 2, sustain: 0 }, { level: 1 }, { multiple: 7, detune: 3 }, { release: 0.8 }] } } },
        });

        expect(parseSongDoc(JSON.parse(serializeSongDoc(file)), 'bell.song')).toEqual(file);
        expect(() => parseSongDoc({ chip: 'genesis', tempo: 60, voices: {}, instruments: { x: { fm: { algorithm: 1, operators: [{}] } } } }, 'x.song')).toThrow(/"fm" of the instrument "x"/);
    });

    it("plays every one of the engine's instruments meant for its voices", () => {
        for (const info of BUILTIN.MUSIC.INSTRUMENTS.filter((candidate) => candidate.voices.some((voice) => voice.startsWith('fm') || voice.startsWith('psg')))) {
            const voice = info.voices.find((candidate) => candidate.startsWith('fm') || candidate.startsWith('psg'))!;
            const rendered = renderSong(song({ [voice]: { notes: voice === 'psgNoise' ? `@${info.key} x4` : `@${info.key} c'4` } }));
            expect([info.key, rendered.errors, rendered.instrumentErrors]).toEqual([info.key, [], []]);
            expect(peakIn(rendered.voices[voice]!, 0, RATE)).toBeGreaterThan(0.005);
        }
    });
});
