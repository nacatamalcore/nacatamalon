import type { TAudioClip } from '../../loaders/audio/types/t_audio_clip';
import type { TSoundFade } from './t_sound';

/**
 * One layer of a piece of music: a file, or a clip already loaded, and how loud it starts.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMusicLayerOptions = ({ src: string; key?: string } | { clip: TAudioClip }) & {
    /**
     * `0` silent, `1` as recorded. Default `1`.
     */
    volume?: number;
};

/**
 * How a piece of music in layers plays.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMusicOptions = {
    /**
     * The same name the saved scene keeps. Made up when nobody says.
     */
    id?: string;
    /**
     * The layers, by name: the same tune played by different instruments, each in its own file and
     * all the same length. They always play together and in time, and what changes is how loud each
     * one is.
     */
    layers: Record<string, TMusicLayerOptions>;
    /**
     * The volume of the whole piece. Default `1`.
     */
    volume?: number;
    /**
     * Default `'music'`.
     */
    channel?: string;
    /**
     * Starts as soon as every layer is ready, with no `play()`. Default `false`.
     */
    autoplay?: boolean;
};

/**
 * One layer, as the object carries it.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMusicLayer = {
    name: string;
    clip: TAudioClip;
    volume: number;
};

/**
 * A piece of music in layers attached to one object: which files, and how loud each is meant to
 * be. What it keeps is the intention, never how far into the tune it had got.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMusicAttachment = {
    readonly type: 'music';
    id: string;
    layers: TMusicLayer[];
    volume: number;
    channel: string;
    autoplay: boolean;
};

/**
 * Controls a piece of music made with `useMusic`.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMusicHandle = {
    /**
     * Starts every layer from the beginning and together. Does nothing until they are all loaded.
     */
    play(options?: TSoundFade): void;
    /**
     * Stops it, fading out first when asked to.
     */
    stop(options?: TSoundFade): void;
    /**
     * Freezes it where it is. `resume` carries on from there, still in time.
     */
    pause(): void;
    resume(): void;
    /**
     * The volume of the whole piece, over `fade` seconds if given.
     */
    setVolume(volume: number, fade?: number): void;
    /**
     * How loud one layer is, over `fade` seconds if given. This is how the music changes with the
     * place: the drums come in for the fight, the tune goes muffled under water.
     */
    setLayer(name: string, volume: number, fade?: number): void;
    /**
     * How loud a layer is meant to be. `0` for a name the music does not have.
     */
    getLayer(name: string): number;
    readonly playing: boolean;
};
