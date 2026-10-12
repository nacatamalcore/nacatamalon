import type { TSoundFade } from './t_sound';
import type { TBeatListener } from '../beat_clock';
import type { TSongError, TSongVoiceName } from '../synth/types/t_song';
import type { TSongFile } from '../../loaders/song/types/t_song_file';

/**
 * How a song written as notes plays.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongOptions = {
    /**
     * The same name the saved scene keeps. Made up when nobody says.
     */
    id?: string;
    /**
     * The volume of the whole song. Default `1`.
     */
    volume?: number;
    /**
     * Default `'music'`.
     */
    channel?: string;
    /**
     * Starts as soon as the song is ready, with no `play()`. Default `false`.
     */
    autoplay?: boolean;
    /**
     * How loud each voice starts, `0` to `1`. A voice not named starts at `1`.
     */
    voices?: Partial<Record<TSongVoiceName, number>>;
    /**
     * Beats per minute, instead of what the file says.
     */
    tempo?: number;
    /**
     * Semitones up, or down below zero, for every voice but the drums. Default `0`.
     */
    transpose?: number;
};

/**
 * A song attached to one object: which file, and how it was asked to play.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongAttachment = {
    readonly type: 'song';
    id: string;
    file: TSongFile;
    volume: number;
    channel: string;
    autoplay: boolean;
    voices: Partial<Record<TSongVoiceName, number>>;
    /**
     * `null` for what the file says.
     */
    tempo: number | null;
    transpose: number;
};

/**
 * Controls a song made with `useSong`.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongHandle = {
    /**
     * Plays it from the beginning, intro included. Does nothing until the song is ready.
     */
    play(options?: TSoundFade): void;
    stop(options?: TSoundFade): void;
    pause(): void;
    resume(): void;
    /**
     * The volume of the whole song, over `fade` seconds if given.
     */
    setVolume(volume: number, fade?: number): void;
    /**
     * How loud one voice is, over `fade` seconds if given: the drums in for the last inning, the
     * harmony out under water. `0` silences it without losing its place.
     */
    setVoice(voice: TSongVoiceName, volume: number, fade?: number): void;
    getVoice(voice: TSongVoiceName): number;
    /**
     * Faster or slower, in beats per minute, carrying on from the same beat it was on.
     */
    setTempo(bpm: number): void;
    /**
     * Higher or lower, in semitones from how it is written, carrying on from where it was. `0` is
     * back in its own key.
     */
    setTranspose(semitones: number): void;
    /**
     * The beats per minute it plays at now.
     */
    readonly tempo: number;
    /**
     * Calls `listener` on every beat while it plays, with the beat of the bar and the bar, both
     * from `1`. Hands back what stops it; it stops on its own with the song's object.
     */
    onBeat(listener: TBeatListener): () => void;
    /**
     * What in the notes could not be read. Empty until the song is ready, and when it is right.
     */
    readonly errors: readonly TSongError[];
    readonly playing: boolean;
};
