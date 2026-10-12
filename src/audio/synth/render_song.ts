import { createNoise, frequencyOf, pulse, triangle } from './oscillators';
import { parseSongNotes } from './parse_song_notes';
import type { TRenderedSong, TSongDoc, TSongError, TSongNote, TSongVoiceName } from './types/t_song';

/**
 * The order voices are read and drawn in.
 */
export const SONG_VOICES: readonly TSongVoiceName[] = ['pulse1', 'pulse2', 'triangle', 'noise'];

/**
 * How loud each voice is at full volume. They add up to less than `1`, so the four together at full
 * volume never go past what a speaker takes, and nothing has to be turned down afterwards.
 */
const LEVELS: Record<TSongVoiceName, number> = { pulse1: 0.26, pulse2: 0.22, triangle: 0.3, noise: 0.18 };

/**
 * How long a note takes to come in and to go out, in seconds. Short enough not to be heard as a
 * fade, long enough that a note starting or stopping does not click.
 */
const ATTACK = 0.002;
const RELEASE = 0.008;

/**
 * How quickly a drum hit dies away, in seconds: noise is played as a drum, not as a held tone.
 */
const DRUM_DECAY = 0.05;

/**
 * Writes one note into its voice's track.
 */
const writeNote = (
    track: Float32Array,
    note: TSongNote,
    from: number,
    to: number,
    sampleRate: number,
    level: number,
    duty: number,
): void => {
    const step = frequencyOf(note.pitch) / sampleRate;
    const noise = note.voice === 'noise' ? createNoise(note.pitch, sampleRate) : null;
    const span = to - from;
    const attack = Math.max(1, Math.round(ATTACK * sampleRate));
    const release = Math.max(1, Math.round(RELEASE * sampleRate));
    let phase = 0;
    for (let i = 0; i < span && from + i < track.length; i += 1) {
        let wave: number;
        if (noise !== null) {
            wave = noise() * Math.exp(-i / (DRUM_DECAY * sampleRate));
        } else if (note.voice === 'triangle') {
            wave = triangle(phase);
        } else {
            wave = pulse(phase, duty);
        }
        phase += step;
        const envelope = Math.min(1, i / attack, (span - i) / release);
        track[from + i] = wave * envelope * level;
    }
};

/**
 * Turns a song into sound: one track per voice, of samples between `-1` and `1`, all the same length
 * so they play together as layers and can be mixed into one.
 *
 * It needs nothing of the browser, so the same song sounds the same in a game, in the editor that
 * wrote it, and in a test that measures it. Given the same song it gives back the same samples,
 * every time.
 *
 * Whatever in the text could not be read is in `errors`, with where it was, and the rest is played:
 * a wrong note costs that note, not the song.
 *
 * @param doc - The song.
 * @param sampleRate - Samples per second. Default `44100`.
 * @param options - `transpose`: semitones up (or down, below zero) for every voice but the noise,
 * which plays drums and has no key.
 * @returns The tracks, how long they are, where the loop goes back to, every note, and the errors.
 *
 * @example
 * ```ts
 * const song = renderSong({
 *     format: SONG_FORMAT,
 *     tempo: 120,
 *     meter: [3, 4],
 *     voices: { pulse1: { notes: "d'4 g8 a b c' | d'4 g g |" } },
 * });
 * song.errors; // [] when every bar adds up
 * ```
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const renderSong = (doc: TSongDoc, sampleRate = 44100, options: { transpose?: number } = {}): TRenderedSong => {
    const transpose = options.transpose ?? 0;
    const secondsPerBeat = 60 / doc.tempo;
    const samplesPerBeat = secondsPerBeat * sampleRate;
    const barBeats = doc.meter[0];

    const notes: TSongNote[] = [];
    const errors: TSongError[] = [];
    let end = 0;
    for (const voice of SONG_VOICES) {
        const written = doc.voices[voice];
        if (written === undefined) {
            continue;
        }
        const read = parseSongNotes(written.notes, voice, doc.meter);
        if (transpose !== 0 && voice !== 'noise') {
            for (const note of read.notes) {
                note.pitch += transpose;
            }
        }
        notes.push(...read.notes);
        errors.push(...read.errors);
        end = Math.max(end, read.end);
    }

    // Whole bars, at least one, and at least up to the bar the loop goes back to.
    const loopBar = doc.loop?.bar ?? 1;
    const bars = Math.max(1, Math.ceil(end / barBeats - 1e-9), loopBar);
    const length = Math.round(bars * barBeats * samplesPerBeat);
    const loopSample = Math.round((loopBar - 1) * barBeats * samplesPerBeat);

    const voices: Partial<Record<TSongVoiceName, Float32Array>> = {};
    for (const voice of SONG_VOICES) {
        const written = doc.voices[voice];
        if (written === undefined) {
            continue;
        }
        const track = new Float32Array(length);
        const level = LEVELS[voice] * Math.min(1, Math.max(0, written.volume ?? 1));
        const duty = written.duty ?? 0.5;
        for (const note of notes) {
            if (note.voice !== voice) {
                continue;
            }
            const from = Math.round(note.start * samplesPerBeat);
            const to = Math.round((note.start + note.beats) * samplesPerBeat);
            writeNote(track, note, from, to, sampleRate, level, duty);
        }
        voices[voice] = track;
    }

    return {
        sampleRate,
        length,
        duration: length / sampleRate,
        loopSample,
        loopStart: loopSample / sampleRate,
        voices,
        notes,
        errors,
    };
};

/**
 * Every voice of a rendered song added into one track, for a file or a measure of the whole.
 *
 * @param song - What `renderSong` gave back.
 * @returns One track, as long as the song.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mixSong = (song: TRenderedSong): Float32Array => {
    const mix = new Float32Array(song.length);
    for (const voice of SONG_VOICES) {
        const track = song.voices[voice];
        if (track === undefined) {
            continue;
        }
        for (let i = 0; i < mix.length; i += 1) {
            mix[i]! += track[i]!;
        }
    }
    return mix;
};
