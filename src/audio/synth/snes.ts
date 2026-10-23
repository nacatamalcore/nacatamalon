import type { TSongSample } from './types/t_song';

/**
 * The SNES's sound, imitated: eight voices that each play a sample, at the console's own rate and
 * with its grain, and an echo the voices can be sent into.
 *
 * The grain comes from three things the console did and that are done here the same way:
 *
 * - **Its samples were stored in BRR**, sixteen samples at a time in four bits each, a shift for the
 *   block and one of four ways of guessing a sample from the two before it. A sample is made into
 *   that and back, so what is heard is what the console could hold.
 * - **It played them at 32000 samples a second**, each held until the next.
 * - **It smoothed between samples** with a soft curve over four of them, which takes the edge off
 *   the highs: the console's muffled warmth.
 */

/**
 * How many samples a second the console played.
 */
export const SNES_RATE = 32000;

/**
 * A sample made into the console's form: its samples at its rate, after BRR, where it starts again,
 * and the note it sounds as it is.
 *
 * @internal
 */
export type TSnesSample = { data: Float32Array; loop: number; root: number };

/**
 * The four guesses BRR could make of a sample from the two before it, `p1` the one just before.
 */
const PREDICT = [
    (_p1: number, _p2: number) => 0,
    (p1: number, _p2: number) => p1 * 15 / 16,
    (p1: number, p2: number) => p1 * 61 / 32 - p2 * 15 / 16,
    (p1: number, p2: number) => p1 * 115 / 64 - p2 * 13 / 16,
];

const clamp16 = (value: number): number => Math.max(-32768, Math.min(32767, value));

/**
 * A sample as the console would have held it: brought to its rate, then each block of sixteen made
 * into four bits with the shift and the guess that keep it closest, and read back. Where it starts
 * again moves to the start of its block, as the console's loops did.
 *
 * @internal
 */
const made = new WeakMap<Float32Array, Map<string, TSnesSample>>();

export const toSnes = (sample: TSongSample): TSnesSample => {
    // The same recording asked for again (a song made again at another tempo) is not made again.
    const id = `${sample.sampleRate}|${sample.loopStart ?? ''}|${sample.root ?? ''}`;
    let byId = made.get(sample.samples);
    if (byId === undefined) {
        byId = new Map();
        made.set(sample.samples, byId);
    }
    const known = byId.get(id);
    if (known !== undefined) return known;
    const result = makeSnes(sample);
    byId.set(id, result);
    return result;
};

const makeSnes = (sample: TSongSample): TSnesSample => {
    const length = Math.max(16, Math.ceil(((sample.samples.length / sample.sampleRate) * SNES_RATE) / 16) * 16);
    const source = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
        const at = (i / SNES_RATE) * sample.sampleRate;
        const index = Math.floor(at);
        const part = at - index;
        source[i] = (sample.samples[index] ?? 0) * (1 - part) + (sample.samples[index + 1] ?? 0) * part;
    }
    const data = new Float32Array(length);
    let p1 = 0;
    let p2 = 0;
    for (let block = 0; block < length; block += 16) {
        let best: { error: number; out: number[]; p1: number; p2: number } | null = null;
        for (let filter = 0; filter < 4; filter += 1) {
            for (let shift = 0; shift <= 12; shift += 1) {
                let a = p1;
                let b = p2;
                let error = 0;
                const out: number[] = [];
                for (let i = 0; i < 16; i += 1) {
                    const wanted = Math.round(Math.max(-1, Math.min(1, source[block + i]!)) * 32000);
                    const guess = PREDICT[filter]!(a, b);
                    const nibble = Math.max(-8, Math.min(7, Math.round(((wanted - guess) * 2) / 2 ** shift)));
                    const got = clamp16(Math.trunc((nibble * 2 ** shift) / 2) + guess);
                    error += (got - wanted) ** 2;
                    out.push(got);
                    b = a;
                    a = got;
                }
                if (best === null || error < best.error) best = { error, out, p1: a, p2: b };
            }
        }
        best!.out.forEach((value, i) => { data[block + i] = value / 32768; });
        p1 = best!.p1;
        p2 = best!.p2;
    }
    const loop = sample.loopStart === undefined ? -1 : Math.min(length - 16, Math.round(((sample.loopStart / sample.sampleRate) * SNES_RATE) / 16) * 16);
    return { data, loop, root: sample.root ?? 60 };
};

/**
 * A sample's value between two of its samples, over the four around it with a soft curve: the
 * console's smoothing, which takes the edge off the highs. Past its end it starts again from its
 * loop, or is silent.
 *
 * @internal
 */
export const snesValueAt = (sample: TSnesSample, position: number): number => {
    const { data, loop } = sample;
    const at = (index: number): number => {
        if (index < 0) return 0;
        if (index < data.length) return data[index]!;
        if (loop < 0) return 0;
        return data[loop + ((index - loop) % (data.length - loop))]!;
    };
    const index = Math.floor(position);
    const t = position - index;
    const t2 = t * t;
    const t3 = t2 * t;
    return at(index - 1) * ((1 - t) ** 3 / 6)
        + at(index) * ((3 * t3 - 6 * t2 + 4) / 6)
        + at(index + 1) * ((-3 * t3 + 3 * t2 + 3 * t + 1) / 6)
        + at(index + 2) * (t3 / 6);
};

/**
 * How far the console could raise a sample: two octaves above how it sounds.
 */
export const SNES_MOST = 4;

/**
 * What the echo is set to, as a song says it.
 *
 * @internal
 */
export type TEchoSettings = { delay?: number; feedback?: number; volume?: number; filter?: number[] };

/**
 * The echo as it goes: what the voices send into it comes back `delay` later, filtered by eight
 * steps and fed back into itself by `feedback`, at `volume`. It keeps what it is holding between
 * one stretch and the next, so a song made as it plays echoes on round its loop as the console did.
 *
 * @internal
 */
export const createEchoStream = (sampleRate: number, settings: TEchoSettings | undefined): ((input: Float32Array, output: Float32Array) => void) => {
    // The console set its delay in steps of 16 ms, up to 240.
    const delay = Math.max(1, Math.round(Math.min(0.24, Math.max(0.016, Math.round((settings?.delay ?? 0.12) / 0.016) * 0.016)) * sampleRate));
    const feedback = Math.max(-1, Math.min(1, settings?.feedback ?? 0.4));
    const volume = Math.max(0, Math.min(1, settings?.volume ?? 0.25));
    const filter = Array.from({ length: 8 }, (_, i) => Math.max(-1, Math.min(1, settings?.filter?.[i] ?? (i === 0 ? 1 : 0))));
    const buffer = new Float32Array(delay);
    const recent = new Float32Array(8);
    let slot = 0;
    return (input, output) => {
        for (let i = 0; i < input.length; i += 1) {
            // The newest of the eight it filters over is what comes back now.
            recent.copyWithin(1, 0, 7);
            recent[0] = buffer[slot]!;
            let filtered = 0;
            for (let k = 0; k < 8; k += 1) filtered += filter[k]! * recent[k]!;
            buffer[slot] = input[i]! + filtered * feedback;
            output[i] = filtered * volume;
            slot = slot + 1 === delay ? 0 : slot + 1;
        }
    };
};

/**
 * The echo of a whole song made at once.
 *
 * What it does past the song's end is carried round to where the loop goes back to, so a song that
 * goes round does not lose its echo at the seam. A song made as it plays has no seam to carry it
 * over: its echo goes on round the loop by itself.
 *
 * @internal
 */
export const renderEcho = (
    send: Float32Array,
    sampleRate: number,
    loopSample: number,
    settings: TEchoSettings | undefined,
): Float32Array => {
    const length = send.length;
    const total = length + (length - loopSample);
    const input = new Float32Array(total);
    input.set(send);
    input.set(send.subarray(loopSample), length);
    const out = new Float32Array(total);
    createEchoStream(sampleRate, settings)(input, out);
    const echo = out.slice(0, length);
    for (let i = length; i < total; i += 1) echo[loopSample + (i - length)]! += out[i]!;
    return echo;
};
