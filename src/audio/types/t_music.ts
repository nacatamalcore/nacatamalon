import type { TAudioClip } from '../../loaders/audio/types/t_audio_clip';
import type { TSoundFade } from './t_sound';
import type { TBeatListener } from '../beat_clock';

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
     * Starts as soon as every layer is ready, with no `play()`. Default `false`. In a scene coming in with a
     * transition it waits for the swap, when the screen is covered, rather than sounding under the
     * cover over the music of the scene still on screen.
     */
    autoplay?: boolean;
    /**
     * Seconds that `autoplay` takes to come up from silence. Default `0`, at full volume at once.
     * With the `fadeOut` of the music it replaces, two scenes cross their music: the one leaving
     * goes down as this one comes up.
     */
    fadeIn?: number;
    /**
     * Seconds it takes to go down to silence when what asked for it goes away: its scene stops, its
     * object is destroyed. It goes on being heard for that long after. Default `0`, cut at once.
     */
    fadeOut?: number;
    /**
     * Where the loop goes back to, in seconds into the tune. Everything before it is an intro that
     * plays once. Default `0`, the whole tune.
     */
    loopStart?: number;
    /**
     * Where the loop turns back, in seconds into the tune. Default `0`, the end of the files.
     */
    loopEnd?: number;
    /**
     * The tune's tempo in beats per minute, which is what lets `onBeat` count it. A file does not
     * say its own tempo, so without this there are no beats to count.
     */
    bpm?: number;
    /**
     * How many beats a bar has. Default `4`.
     */
    beatsPerBar?: number;
    /**
     * Seconds into the file where the first beat falls, for a file with silence or a pickup before
     * it. Default `0`.
     */
    firstBeat?: number;
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
    /**
     * Where between left (`-1`) and right (`1`) it is heard. Absent, in the middle.
     */
    pan?: number;
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
    /**
     * Seconds, `0` for none: see the options.
     */
    fadeIn: number;
    fadeOut: number;
    /**
     * `0` for both is the whole tune.
     */
    loopStart: number;
    loopEnd: number;
    /**
     * `null` when nobody said, and then it has no beats to count.
     */
    bpm: number | null;
    beatsPerBar: number;
    firstBeat: number;
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
    /**
     * Calls `listener` on every beat while it plays, with the beat of the bar and the bar, both from
     * `1`: a crowd that claps in time, a title that pulses with the tune. Going by the audio clock,
     * not the frames, on the frame the beat is **heard**: as late as the sound reaches the player
     * (the device's delay and `useAudio().setOffset`). Needs `bpm`. Hands back what stops it; it stops on its own with the music's
     * object.
     */
    onBeat(listener: TBeatListener): () => void;
    /**
     * How far into the music the player is hearing now, in seconds, or `null` while it is stopped:
     * by the audio clock, with the time the sound takes to reach the speaker and the player's offset
     * (`useAudio().setOffset`) taken off. It goes back to `loopStart` when the music loops. The same
     * as a song's: see `TSongHandle.position`.
     */
    readonly position: number | null;
    /**
     * How far into the music the player is hearing now, in beats from its first (`firstBeat`), or
     * `null` while it is stopped or when it has no `bpm`: `3.5` is half way through the fourth beat,
     * and before the first it is below `0`. What a thing moving with the music is placed by:
     * `dancer.frame = beat - Math.floor(beat) < 0.2 ? 1 : 0`. Not the `beat` an `onBeat` listener
     * is given, which is the beat of the bar.
     */
    readonly beat: number | null;
    /**
     * How long a sound started now takes to be heard, in seconds: the device's delay and the
     * player's offset. What `position` takes off.
     */
    readonly latency: number;
    /**
     * Where the music was being heard at `moment`, a time on the page's clock such as a press gives
     * (`keys.pressedAt`, `pointer.pressedAt`…), or `null` while it is stopped. See
     * `TSongHandle.positionAt`.
     */
    positionAt(moment: number): number | null;
    readonly playing: boolean;
};
