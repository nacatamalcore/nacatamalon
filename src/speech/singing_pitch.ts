import { hertzOf } from './voice_settings';

/**
 * A note placed in time. `held` is when its syllable began, which is before it when the syllable is
 * held over several notes, and `fresh` says it comes after a rest.
 *
 * @internal
 */
export type TPlacedNote = { pitch: number; start: number; held: number; fresh: boolean };

/**
 * The voice leaves a note a little before the next one and settles a little after it begins, in
 * seconds, or a part of the notes when they are short.
 */
const LEAVE = 0.06;
const SETTLE = 0.045;
const PART = 0.3;

/**
 * How far past a note it goes before settling, as a part of the jump and at most, in semitones, and
 * how far under its first note after a rest it begins.
 */
const PAST = 0.07;
const MOST_PAST = 0.3;
const SCOOP = 0.5;
const PAST_TIME = 0.094;

/**
 * Vibrato comes in on a held syllable after a moment, then grows. It is never quite regular.
 */
const VIBRATO_RATE = 5.3;
const VIBRATO_DELAY = 0.18;
const VIBRATO_GROW = 0.3;
const DRIFT = 0.18;
const DRIFT_RATE = 0.61;

/**
 * A number from `0` to `1` out of a seed: the `n`th thing that makes one singer unlike another.
 *
 * @internal
 */
export const traitOf = (seed: number, n: number): number => {
    let state = Math.imul(Math.trunc(seed) ^ Math.imul(n + 1, 0x9e3779b1), 0x85ebca6b);
    state = Math.imul(state ^ (state >>> 13), 0xc2b2ae35);
    return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
};

/**
 * How far a held syllable wavers over time, from `-1` to `1`: one wave through all the notes it is
 * held over. Asked in order.
 *
 * @internal
 */
export const vibratoWave = (notes: readonly TPlacedNote[], seed: number): ((time: number) => number) => {
    const rate = VIBRATO_RATE * (0.96 + 0.08 * traitOf(seed, 1));
    const turn = traitOf(seed, 2);
    let index = 0;
    return (time) => {
        while (index < notes.length - 1 && time >= notes[index + 1]!.start) index += 1;
        const note = notes[index];
        if (!note) return 0;
        const began = note.held + VIBRATO_DELAY;
        const held = time - began;
        if (held <= 0) return 0;
        const drift = Math.sin(2 * Math.PI * (DRIFT_RATE * time + turn)) - Math.sin(2 * Math.PI * (DRIFT_RATE * began + turn));
        return Math.min(1, held / VIBRATO_GROW) * Math.sin(2 * Math.PI * (rate * held + DRIFT * drift));
    };
};

/**
 * The pitch of a sung line over time, in Hz: each note slid into from the one before, a little past
 * it and back, with vibrato growing on a held one, `detune` semitones off. Asked in order.
 *
 * @internal
 */
export const singingPitch = (notes: readonly TPlacedNote[], vibrato: number, seed: number, detune = 0): ((time: number) => number) => {
    const wave = vibratoWave(notes, seed);
    const from = notes.map((note, i) => note.start - Math.min(LEAVE, PART * (i > 0 ? note.start - notes[i - 1]!.start : LEAVE / PART)));
    const to = notes.map((note, i) => note.start + Math.min(SETTLE, PART * (notes[i + 1] ? notes[i + 1]!.start - note.start : SETTLE / PART)));
    let index = 0;
    return (time) => {
        while (index < notes.length - 1 && time >= from[index + 1]!) index += 1;
        const note = notes[index];
        if (!note) return hertzOf(57);
        const before = index > 0 && !note.fresh ? notes[index - 1]!.pitch : note.pitch - SCOOP;
        const jump = note.pitch - before;
        let pitch = note.pitch;
        if (time < to[index]!) {
            const along = Math.max(0, Math.min(1, (time - from[index]!) / Math.max(1e-6, to[index]! - from[index]!)));
            pitch = before + jump * along * along * (3 - 2 * along);
        } else {
            const since = time - to[index]!;
            // It is back on the note before it leaves for the next, and goes less far on a short one.
            const length = Math.min(PAST_TIME, (from[index + 1] ?? Infinity) - to[index]!);
            if (since < length) {
                const far = Math.min(MOST_PAST, Math.abs(jump) * PAST) * (length / PAST_TIME);
                pitch += Math.sign(jump) * far * Math.sin((Math.PI * since) / length) * Math.exp(-since / 0.06);
            }
        }
        return hertzOf(pitch + detune + (vibrato === 0 ? 0 : vibrato * wave(time)));
    };
};
