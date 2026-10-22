import type { TSongSample } from './types/t_song';

/**
 * The console's samples: how a recording is made into its bits, how fast each note plays one, and
 * back again, for a sample that arrives already in those bits (from a tracker's file).
 */

/**
 * The sixteen speeds the console plays a sample at, in samples a second. A sample is made into the
 * console's bits at the fastest, so that one is how it was recorded and the others are slower and
 * deeper.
 */
export const DPCM_RATES: readonly number[] = [
    4181.71, 4709.93, 5264.04, 5593.04, 6257.95, 7046.35, 7919.35, 8363.42,
    9419.86, 11186.1, 12604.0, 13982.6, 16884.6, 21306.8, 24858.0, 33143.9,
];

/**
 * The note a sample plays as it was recorded at: the C above middle C.
 */
export const DPCM_NATURAL = 72;

/**
 * A sample made into the console's own bits: at its fastest speed, one bit a step that moves the
 * level up or down by two, from the middle of the seven bits it has. What comes out is that level at
 * every step, between `-1` and `1`, which is the grain the console's samples have.
 */
export const toDpcm = (sample: TSongSample): Float32Array => {
    const rate = DPCM_RATES[DPCM_RATES.length - 1]!;
    const steps = Math.floor((sample.samples.length / sample.sampleRate) * rate);
    const out = new Float32Array(steps);
    let level = 64;
    for (let i = 0; i < steps; i += 1) {
        const at = (i / rate) * sample.sampleRate;
        const index = Math.floor(at);
        const part = at - index;
        const value = (sample.samples[index] ?? 0) * (1 - part) + (sample.samples[index + 1] ?? 0) * part;
        const wanted = (Math.max(-1, Math.min(1, value)) + 1) * 63.5;
        level = wanted > level ? Math.min(127, level + 2) : Math.max(0, level - 2);
        out[i] = level / 64 - 1;
    }
    return out;
};

/**
 * The speed of the sixteen the console would play a sample at for a pitch: the one nearest to it.
 */
export const dpcmRateOf = (pitch: number): number => {
    const wanted = DPCM_RATES[DPCM_RATES.length - 1]! * 2 ** ((pitch - DPCM_NATURAL) / 12);
    let best = DPCM_RATES[0]!;
    for (const rate of DPCM_RATES) {
        if (Math.abs(Math.log(rate / wanted)) < Math.abs(Math.log(best / wanted))) {
            best = rate;
        }
    }
    return best;
};

/**
 * The console's bits made back into sound: each bit moves the level two steps up (1) or down (0),
 * the lowest bit of each byte first, from `start`. What comes out is at the speed the sample was
 * meant to play at, so it plays as it did on the console.
 *
 * @param bytes - The sample as the console stores it.
 * @param rate - Which of the sixteen speeds it plays at, `0` to `15`.
 * @param start - The level it starts from, `0` to `127`. Default `64`, the middle.
 *
 * @internal
 */
export const fromDpcm = (bytes: Uint8Array, rate: number, start = 64): TSongSample => {
    const samples = new Float32Array(bytes.length * 8);
    let level = Math.min(127, Math.max(0, start));
    for (let i = 0; i < bytes.length; i += 1) {
        for (let bit = 0; bit < 8; bit += 1) {
            level = (bytes[i]! >> bit) & 1 ? Math.min(127, level + 2) : Math.max(0, level - 2);
            samples[i * 8 + bit] = level / 64 - 1;
        }
    }
    return { samples, sampleRate: DPCM_RATES[Math.min(15, Math.max(0, Math.round(rate)))]! };
};
