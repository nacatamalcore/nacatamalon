import type { TFmOperator, TFmPatch } from './types/t_song';

/**
 * The Genesis's sound, imitated: six FM voices, each four sine waves (operators) that either are
 * heard or bend the others, and the three squares and noise of its second chip.
 *
 * Nothing here is the chip's own: it is the same idea, worked out in ordinary units (seconds, levels
 * from `0` to `1`), with the things that give it its sound kept: the eight ways the operators join,
 * the first one bending itself, and an output in nine bits.
 */

/**
 * Which operators bend which, for each of the eight ways: `into[k]` lists the operators `k` bends,
 * and `heard` the ones whose sound comes out. Operator `0` is the first.
 */
const ALGORITHMS: ReadonlyArray<{ into: number[][]; heard: number[] }> = [
    { into: [[1], [2], [3], []], heard: [3] },
    { into: [[2], [2], [3], []], heard: [3] },
    { into: [[3], [2], [3], []], heard: [3] },
    { into: [[1], [3], [3], []], heard: [3] },
    { into: [[1], [], [3], []], heard: [1, 3] },
    { into: [[1, 2, 3], [], [], []], heard: [1, 2, 3] },
    { into: [[1], [], [], []], heard: [1, 2, 3] },
    { into: [[], [], [], []], heard: [0, 1, 2, 3] },
];

/**
 * How much the first operator bends itself at each of the eight steps of `feedback`, in radians: the
 * same doubling steps the chip has.
 */
const FEEDBACK = [0, Math.PI / 16, Math.PI / 8, Math.PI / 4, Math.PI / 2, Math.PI, 2 * Math.PI, 4 * Math.PI];

/**
 * How far an operator at full `level` bends the one it goes into, in radians.
 */
const BEND = 4;

type TOperator = Required<TFmOperator>;

const DEFAULT_OPERATOR: TOperator = { multiple: 1, detune: 0, level: 1, attack: 0, decay: 0, sustain: 1, release: 0.05 };

/**
 * An FM voice playing one note: call it once a sample with the note's frequency, and with whether the
 * note is still held. It answers its sound, and whether it is still sounding at all.
 *
 * @internal
 */
export const createFmVoice = (patch: TFmPatch, sampleRate: number): ((hz: number, held: boolean) => { out: number; sounding: boolean }) => {
    const algorithm = ALGORITHMS[Math.min(7, Math.max(0, Math.round(patch.algorithm)))]!;
    const feedback = FEEDBACK[Math.min(7, Math.max(0, Math.round(patch.feedback ?? 0)))]!;
    const operators: TOperator[] = patch.operators.map((operator) => ({ ...DEFAULT_OPERATOR, ...operator }));
    const ratios = operators.map((operator) => operator.multiple * 2 ** (operator.detune / 1200));
    const phases = [0, 0, 0, 0];
    const envelopes = [0, 0, 0, 0];
    let time = 0;
    let releasedAt = -1;
    const releasedFrom = [0, 0, 0, 0];
    let last1 = 0;
    let last2 = 0;
    const outs = [0, 0, 0, 0];
    const bends = [0, 0, 0, 0];

    const envelopeOf = (k: number, held: boolean): number => {
        const op = operators[k]!;
        if (held) {
            if (time < op.attack) return time / op.attack;
            const falling = time - op.attack;
            if (falling < op.decay) return 1 - (1 - op.sustain) * (falling / op.decay);
            return op.sustain;
        }
        const after = time - releasedAt;
        if (op.release <= 0 || after >= op.release) return 0;
        return releasedFrom[k]! * (1 - after / op.release);
    };

    return (hz, held) => {
        if (!held && releasedAt < 0) {
            releasedAt = time;
            for (let k = 0; k < 4; k += 1) releasedFrom[k] = envelopes[k]!;
        }
        for (let k = 0; k < 4; k += 1) envelopes[k] = envelopeOf(k, held);
        bends.fill(0);
        for (let k = 0; k < 4; k += 1) {
            const self = k === 0 ? feedback * ((last1 + last2) / 2) : 0;
            const out = Math.sin(2 * Math.PI * phases[k]! + bends[k]! + self) * envelopes[k]! * operators[k]!.level;
            outs[k] = out;
            for (const target of algorithm.into[k]!) bends[target]! += out * BEND;
            phases[k] = (phases[k]! + (hz * ratios[k]!) / sampleRate) % 1;
        }
        last2 = last1;
        last1 = outs[0]!;
        time += 1 / sampleRate;
        let out = 0;
        for (const k of algorithm.heard) out += outs[k]!;
        out /= algorithm.heard.length;
        // The chip's output had nine bits.
        out = Math.round(out * 256) / 256;
        return { out, sounding: held || envelopes.some((level, k) => level > 0 && algorithm.heard.includes(k)) };
    };
};

/**
 * What the second chip counts its notes from.
 */
const PSG_CLOCK = 3579545 / 32;

/**
 * The frequency the second chip can play nearest to the one asked: it divides its clock by a whole
 * number of ten bits, so its high notes come out a little off, as they did.
 *
 * @internal
 */
export const psgFrequencyOf = (hz: number): number => PSG_CLOCK / Math.min(1023, Math.max(1, Math.round(PSG_CLOCK / Math.max(1, hz))));

/**
 * How loud the second chip is at a volume of `0` to `15`: two decibels a step, and `0` silent.
 *
 * @internal
 */
export const psgGainOf = (volume: number): number => (volume <= 0 ? 0 : 10 ** ((-(15 - Math.min(15, volume)) * 2) / 20));

/**
 * The second chip's noise: a sixteen-bit register stepped `steps` times a sample, fed back from two
 * of its bits, heard as its lowest.
 *
 * @internal
 */
export const createPsgNoise = (): ((steps: number) => number) => {
    let register = 0x8000;
    let clock = 0;
    return (steps) => {
        clock += steps;
        while (clock >= 1) {
            const feedback = (register ^ (register >> 3)) & 1;
            register = (register >> 1) | (feedback << 15);
            clock -= 1;
        }
        return register & 1 ? 1 : -1;
    };
};

/**
 * How fast the noise steps for a pitch: higher, more of a hiss, as the console's noise did by its
 * three speeds and the third square's.
 *
 * @internal
 */
export const psgNoiseRateOf = (pitch: number): number => Math.min(PSG_CLOCK, PSG_CLOCK * 2 ** ((pitch - 96) / 12) * 4);
