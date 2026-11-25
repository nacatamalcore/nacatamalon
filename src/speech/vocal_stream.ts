import { createVoice } from './voice';
import { planSinging, sungSettings } from './render_singing';
import { singingPitch, traitOf } from './singing_pitch';
import type { TSharedNote, TSingingPlan } from './render_singing';
import type { TVoiceWriter } from './voice';
import type { TVocalDoc, TVocalLine, TVocalSinger } from './types/t_vocal';

/**
 * How loud a voice is made as it is heard, its loudest about at its `volume`. A voice made all at
 * once is brought to its volume by its loudest sample; one made a stretch at a time cannot look
 * ahead for it, so it is made at this level: measured on sung lines, high and low notes and voices,
 * whose loudest came out between 2.7 and 4.8 as made, so the loudest of them reaches
 * about its volume, and `heldIn` holds what would go past it.
 */
const LEVEL = 0.2;

/**
 * A voice's sample kept inside its volume: as it is up to a knee, then nearing 1 and never past it,
 * for the few notes, the highest of a deep throat, that come out louder than `LEVEL` counts on.
 */
const KNEE = 0.8;
const heldIn = (value: number): number => {
    const size = Math.abs(value);
    if (size <= KNEE) return value;
    const over = (size - KNEE) / (1 - KNEE);
    return Math.sign(value) * (KNEE + (1 - KNEE) * (over / (1 + over)));
};

/**
 * How long after a rest begins the voice is taken to be silent, in seconds: a place after it can be
 * reached by starting again there, rather than from the beginning.
 */
const SETTLE = 0.1;

/**
 * A vocal part made into sound as it plays, a stretch at a time, on its song's clock: sample `0` is
 * the song's first beat.
 *
 * @internal
 */
export type TVocalStream = {
    /**
     * Goes to a place, in samples: each singer starts again from their last rest before it and is
     * taken there without a sound.
     */
    seek(sample: number): void;
    /**
     * Makes the next `count` samples, every singer together.
     */
    render(count: number): Float32Array;
};

/**
 * A part's singers by name: one, `voice`, when it names none.
 *
 * @internal
 */
export const singersOf = (doc: TVocalDoc): Record<string, TVocalSinger> => doc.singers ?? { voice: {} };

/**
 * Who sings a line: the singers it names, or all of them.
 *
 * @internal
 */
export const whoOf = (line: TVocalLine, everyone: readonly string[]): string[] =>
    line.who === undefined ? [...everyone] : Array.isArray(line.who) ? line.who : [line.who];

/**
 * How unlike each other the singers of a part are: their throats, as a part of their length, their
 * pitch, in semitones, and their time, in seconds, either way.
 */
const THROATS_APART = 0.02;
const PITCHES_APART = 0.08;
const TIMES_APART = 0.012;

/**
 * What a singer's name comes to, for what is their own: no two people sing alike.
 */
const seedOf = (name: string): number => [...name].reduce((sum, letter) => (sum * 31 + letter.codePointAt(0)!) % 99991, 7);

/**
 * What one singer sings: their lines, and a rest through each of the others', from where the part
 * starts in the song. A line several sing is as loud as one sung alone.
 */
const notesOf = (doc: TVocalDoc, name: string, everyone: readonly string[]): TSharedNote[] => [
    ...((doc.start ?? 0) > 0 ? [{ beats: doc.start }] : []),
    ...doc.lines.flatMap((line) => (whoOf(line, everyone).includes(name) ? sharedBy(line.notes, new Set(whoOf(line, everyone).filter((one) => everyone.includes(one))).size) : line.notes.map((note) => ({ beats: note.beats })))),
];

const sharedBy = (notes: readonly TSharedNote[], many: number): readonly TSharedNote[] =>
    many === 1 ? notes : notes.map((note) => ({ ...note, share: 1 / Math.sqrt(many) }));

type TSinger = {
    plan: TSingingPlan;
    rate: number;
    gain: number;
    detune: number;
    voice: TVoiceWriter;
    /** The voice's samples made last, from `windowStart`: what the next stretch reads between. */
    window: Float32Array;
    windowStart: number;
};

/**
 * Starts making a vocal part into sound, at a tempo and a key, for a song made at `sampleRate`.
 *
 * Each singer's voice is made at its own sample rate, as it is made all at once, and read at the
 * song's.
 *
 * @internal
 */
export const createVocalStream = (doc: TVocalDoc, how: { tempo: number; transpose: number; sampleRate: number }): TVocalStream => {
    const singers = singersOf(doc);
    const everyone = Object.keys(singers);
    const { sampleRate } = how;

    // The voice started again at the last place before `sample` it can start from silence.
    const startAt = (plan: TSingingPlan, detune: number, sample: number): TVoiceWriter => {
        const time = sample / sampleRate + plan.offset;
        const restart = plan.restarts.filter((one) => one.time <= time - SETTLE).at(-1) ?? plan.restarts[0]!;
        return createVoice(plan.segments, singingPitch(plan.notes, plan.vibrato, plan.settings.seed, detune), sungSettings(plan), restart.segment, restart.time);
    };

    const voices: TSinger[] = everyone.map((name, n) => {
        const singer = singers[name]!;
        // One who sings alone is as they are written; several are each a little off from that.
        const own = seedOf(name) + 99991 * n;
        const apart = (n: number): number => (everyone.length === 1 ? 0 : 2 * traitOf(own, n) - 1);
        const plan = planSinging({
            ...singer,
            seed: singer.seed ?? (everyone.length === 1 ? undefined : own),
            throat: (singer.throat ?? 1) * (1 + THROATS_APART * apart(3)),
            language: singer.language ?? doc.language,
            tempo: how.tempo,
            transpose: (singer.transpose ?? 0) + how.transpose,
            notes: notesOf(doc, name, everyone),
        });
        plan.offset += TIMES_APART * apart(4);
        const detune = PITCHES_APART * apart(5);
        const rate = plan.settings.sampleRate;
        const voice = startAt(plan, detune, 0);
        return { plan, rate, gain: plan.settings.volume, voice, window: new Float32Array(0), windowStart: voice.position, detune };
    });
    let position = 0;

    return {
        seek: (sample) => {
            position = Math.max(0, Math.round(sample));
            for (const singer of voices) {
                singer.voice = startAt(singer.plan, singer.detune, position);
                singer.window = new Float32Array(0);
                singer.windowStart = singer.voice.position;
            }
        },
        render: (count) => {
            const out = new Float32Array(count);
            for (const singer of voices) {
                // Where in the voice's own samples this stretch begins and ends: the song's clock moved
                // by where the voice's first beat is.
                // Counted from the song's sample itself, not from the stretch, so the voice comes out the
                // same however the song is cut into stretches.
                const at = (sample: number): number => (sample / sampleRate + singer.plan.offset) * singer.rate;
                const from = Math.floor(at(position));
                const to = Math.floor(at(position + count - 1)) + 2;
                const next = new Float32Array(to - from);
                const kept = Math.min(to, singer.windowStart + singer.window.length);
                for (let k = Math.max(from, singer.windowStart); k < kept; k += 1) next[k - from] = singer.window[k - singer.windowStart]!;
                if (singer.voice.position < from) singer.voice.write(null, 0, from - singer.voice.position);
                const made = singer.voice.position;
                if (to > made) singer.voice.write(next, made - from, to - made);
                singer.window = next;
                singer.windowStart = from;
                for (let j = 0; j < count; j += 1) {
                    const x = at(position + j) - from;
                    const k = Math.floor(x);
                    const along = x - k;
                    out[j]! += heldIn((next[k]! * (1 - along) + next[k + 1]! * along) * LEVEL) * singer.gain;
                }
            }
            position += count;
            return out;
        },
    };
};
