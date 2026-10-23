import { readSong } from './render_song';
import { createEchoStream } from './snes';
import type { TNoteWriter, TReadVoice } from './render_song';
import type { TSongDoc, TSongError, TSongInstrumentError, TSongSample, TSongVoiceName } from './types/t_song';

/**
 * What a stream makes in one go: a stretch of each voice, and of the echo when the song has one.
 *
 * @internal
 */
export type TSongStretch = {
    voices: Partial<Record<TSongVoiceName, Float32Array>>;
    echo: Float32Array | null;
};

/**
 * A song made into sound as it plays, a stretch at a time, rather than all at once: what is made is
 * what is about to be heard, so it starts at once and holds almost nothing.
 *
 * Its voices come out sample for sample as `renderSong` makes them, round the loop as many times as
 * it is played. Its echo goes on round the loop by itself, as the console's did, where a song made
 * all at once carries what spills past the end back to where the loop starts.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongStream = {
    readonly sampleRate: number;
    /**
     * How long one pass is, and where the loop goes back to, in samples.
     */
    readonly length: number;
    readonly loopSample: number;
    readonly voices: readonly TSongVoiceName[];
    readonly hasEcho: boolean;
    readonly errors: TSongError[];
    readonly instrumentErrors: TSongInstrumentError[];
    /**
     * Where in the song the next sample made is, in samples, from `0` to `length`.
     */
    readonly position: number;
    /**
     * Goes to a place in the song: the notes sounding there are brought to it, as they would be
     * had it been played from the start. The echo starts again empty.
     */
    seek(sample: number): void;
    /**
     * Makes the next `count` samples, going round the loop when it comes to the end.
     */
    render(count: number): TSongStretch;
};

type TVoiceState = {
    voice: TSongVoiceName;
    notes: TReadVoice['notes'];
    /**
     * The next of its notes not yet begun, and the ones sounding now, in the order they are written.
     */
    next: number;
    sounding: TNoteWriter[];
};

/**
 * Starts making a song into sound as it plays, from its beginning.
 *
 * @param doc - The song.
 * @param sampleRate - Samples per second.
 * @param options - As `renderSong` takes them: `transpose`, and the `samples` its instruments name.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createSongStream = (
    doc: TSongDoc,
    sampleRate: number,
    options: { transpose?: number; samples?: ReadonlyMap<string, TSongSample> } = {},
): TSongStream => {
    const read = readSong(doc, sampleRate, options);
    const { length, loopSample } = read;
    const states: TVoiceState[] = read.voices.map(({ voice, notes }) => ({ voice, notes, next: 0, sounding: [] }));
    let echo = read.echo !== null ? createEchoStream(sampleRate, read.echo) : null;
    let cursor = 0;

    // The voices brought to `at`: the notes sounding there made again from their start and taken to
    // it without a sound, the ones after it left to come.
    const bring = (at: number): void => {
        for (const state of states) {
            state.sounding = [];
            state.next = state.notes.length;
            for (let index = 0; index < state.notes.length; index += 1) {
                const note = state.notes[index]!;
                if (note.from >= at) {
                    state.next = index;
                    break;
                }
                if (note.end > at) {
                    const writer = note.make();
                    writer.run(at, null, null, 0);
                    if (!writer.done) state.sounding.push(writer);
                }
            }
        }
        cursor = at;
    };

    // One stretch of the song, `from` to `to`, all within one pass, into `out` from `into` on.
    const write = (from: number, to: number, out: TSongStretch, send: Float32Array | null, into: number): void => {
        const base = from - into;
        for (const state of states) {
            const track = out.voices[state.voice]!;
            while (state.next < state.notes.length && state.notes[state.next]!.from < to) {
                state.sounding.push(state.notes[state.next]!.make());
                state.next += 1;
            }
            for (const writer of state.sounding) writer.run(to, track, send, base);
            state.sounding = state.sounding.filter((writer) => !writer.done && writer.end > to);
        }
        cursor = to;
    };

    return {
        sampleRate,
        length,
        loopSample,
        voices: states.map((state) => state.voice),
        hasEcho: echo !== null,
        errors: read.errors,
        instrumentErrors: read.instrumentErrors,
        get position() {
            return cursor;
        },
        seek: (sample) => {
            bring(Math.min(Math.max(0, Math.round(sample)), length));
            if (read.echo !== null) echo = createEchoStream(sampleRate, read.echo);
        },
        render: (count) => {
            const out: TSongStretch = {
                voices: Object.fromEntries(states.map((state) => [state.voice, new Float32Array(count)])),
                echo: echo !== null ? new Float32Array(count) : null,
            };
            const send = echo !== null ? new Float32Array(count) : null;
            let made = 0;
            while (made < count) {
                if (cursor >= length) {
                    // Round the loop: the voices as they are where it goes back to; the echo goes on.
                    bring(loopSample);
                }
                const to = Math.min(length, cursor + (count - made));
                const from = cursor;
                write(from, to, out, send, made);
                made += to - from;
            }
            if (echo !== null) echo(send!, out.echo!);
            return out;
        },
    };
};
