import { createVoice } from './voice';
import { planSinging, singingPitch } from './render_singing';
import type { TSingingPlan } from './render_singing';
import type { TVoiceWriter } from './voice';
import type { TSungNote } from './types/t_speech';
import type { TVocalDoc, TVocalLine, TVocalSinger } from './types/t_vocal';

/**
 * How loud a voice is made as it is heard, its loudest about at its `volume`. A voice made all at
 * once is brought to its volume by its loudest sample; one made a stretch at a time cannot look
 * ahead for it, so it is made at this level: measured on sung lines in English and Spanish, high and
 * low voices, whose loudest came out between 3.6 and 7.4 as made, so the loudest of them reaches
 * about its volume and none goes past it.
 */
const LEVEL = 0.14;

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
 * What one singer sings: their lines, and a rest through each of the others', from where the part
 * starts in the song.
 */
const notesOf = (doc: TVocalDoc, name: string, everyone: readonly string[]): TSungNote[] => [
    ...((doc.start ?? 0) > 0 ? [{ beats: doc.start }] : []),
    ...doc.lines.flatMap((line) => (whoOf(line, everyone).includes(name) ? line.notes : line.notes.map((note) => ({ beats: note.beats })))),
];

type TSinger = {
    plan: TSingingPlan;
    rate: number;
    gain: number;
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
    const startAt = (plan: TSingingPlan, rate: number, sample: number): TVoiceWriter => {
        const time = sample / sampleRate + plan.offset;
        const restart = plan.restarts.filter((one) => one.time <= time - SETTLE).at(-1) ?? plan.restarts[0]!;
        return createVoice(plan.segments, singingPitch(plan.notes, rate, plan.vibrato), plan.settings, restart.segment, restart.time);
    };

    const voices: TSinger[] = everyone.map((name) => {
        const singer = singers[name]!;
        const plan = planSinging({
            ...singer,
            language: singer.language ?? doc.language,
            tempo: how.tempo,
            transpose: (singer.transpose ?? 0) + how.transpose,
            notes: notesOf(doc, name, everyone),
        });
        const rate = plan.settings.sampleRate;
        const voice = startAt(plan, rate, 0);
        return { plan, rate, gain: LEVEL * plan.settings.volume, voice, window: new Float32Array(0), windowStart: voice.position };
    });
    let position = 0;

    return {
        seek: (sample) => {
            position = Math.max(0, Math.round(sample));
            for (const singer of voices) {
                singer.voice = startAt(singer.plan, singer.rate, position);
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
                    out[j]! += (next[k]! * (1 - along) + next[k + 1]! * along) * singer.gain;
                }
            }
            position += count;
            return out;
        },
    };
};
