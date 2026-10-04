import type { TBox } from '../../box/types/t_box';
import type { TSoundAttachment } from './t_sound';

/**
 * One sounding voice: the node playing the sound and everything wired after it.
 *
 * A sound is not a thing that plays, it is a thing that **can be played**: every `play` makes one of
 * these and throws it away when it ends, which is why two coins picked up at once are heard twice.
 *
 * @internal
 */
export type TVoice = {
    node: AudioBufferSourceNode;
    /**
     * This voice's own volume, before the channel's.
     */
    gain: GainNode;
    /**
     * Which channel it goes through, so it can be silenced with the rest of its kind.
     */
    channel: string;
    /**
     * Set only for a sound placed at a point in the world. `null` for a plain one.
     */
    panner: PannerNode | null;
    /**
     * Set only for a sound that fills an area: how loud it is where the listener stands.
     */
    area: GainNode | null;
    /**
     * The object a placed sound belongs to, and what it asked for, both read every frame: the
     * object for where it is now, the sound for its shape and its distances. `null` for a plain one.
     */
    box: TBox | null;
    sound: TSoundAttachment | null;
};

/**
 * Everything one game's sound runs through: the browser's audio engine, the master volume, a volume
 * per channel, and the voices sounding right now.
 *
 * One per game, and made only when a game first asks for sound: a game with no audio never opens an
 * audio engine at all.
 *
 * @internal
 */
export type TAudioManager = {
    context: AudioContext;
    /**
     * Everything ends here, and this is the general volume.
     */
    master: GainNode;
    /**
     * The volume of each channel, made the first time the channel is named.
     */
    channels: Map<string, GainNode>;
    /**
     * Every voice sounding right now, so they can be followed, silenced and stopped.
     */
    voices: Set<TVoice>;
    /**
     * The objects that carry ears, in the order they got them. The first one switched on is used.
     */
    listeners: TBox[];
    /**
     * Whether two sets of ears on at once has been reported already, so it is said once.
     */
    warnedListeners: boolean;
    /**
     * The sounds whose area has a shape of the other dimension, reported once each.
     */
    warnedZones: WeakSet<TSoundAttachment>;
    /**
     * The channel's volume, made on the spot if this is the first time it is asked for.
     */
    channelGain(name: string): GainNode;
    /**
     * Stops everything and closes the audio engine.
     */
    destroy(): void;
};

/**
 * The volumes of a game, and the way to silence it. Returned by `useAudio`.
 *
 * A channel is a group of sounds that share a volume: `'sfx'` and `'music'` are there from the
 * start, and any other name works the moment a sound uses it. This is what an options screen with a
 * slider per kind of sound is made of, and what a game saves in its store.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAudioHandle = {
    /**
     * Sets a volume, from `0` (silent) to `1` (as recorded). Louder than `1` is allowed and can
     * distort. With no channel it is the general one, which multiplies every channel. With `fade`
     * it gets there over that many seconds, which is how music ducks under a cutscene.
     */
    setVolume(volume: number, channel?: string, fade?: number): void;
    /**
     * The volume of a channel, or the general one. `1` for a channel nobody has used yet.
     */
    getVolume(channel?: string): number;
    /**
     * Stops every sound of a channel, or every sound of the game.
     */
    stopAll(channel?: string): void;
};
