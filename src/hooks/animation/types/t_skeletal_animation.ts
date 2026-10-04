import type { TClipEvent } from '../../../animation';

/**
 * What to ask a model's bones to do.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSkeletalAnimationOptions = {
    /**
     * Which movement to start on. Left out, it takes the first the file has.
     */
    play?: string;
    /**
     * Whether it goes round for ever. Default `true`.
     */
    loop?: boolean;
    /**
     * How fast, as a multiple. Default `1`.
     */
    speed?: number;
    /**
     * How long to take easing into a new movement, in seconds. Default `0`, which is a cut.
     */
    fade?: number;
    /**
     * Moments inside a movement worth being told about, by the name of the movement they are in:
     * the instant a blow lands, a foot meets the ground, a spell leaves the hand.
     *
     * **`at` is in seconds from the start of that movement**, because a movement off a file is a
     * continuous thing with no pictures in it to count.
     *
     * They are asked for here rather than written on the movement because **a glTF file has nowhere
     * to put them**: the format says what moves and when, and nothing at all about what any of it
     * is supposed to mean. Somebody has to decide, and this is where.
     *
     * @example
     * ```ts
     * useSkeletalAnimation(fighter, {
     *     play: 'Idle',
     *     events: { Attack: [{ at: 0.42, name: 'hit' }] },
     * });
     * ```
     */
    events?: Readonly<Record<string, readonly TClipEvent[]>>;
};

/**
 * The handle on a model's movement: what it is doing, and how to change it.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSkeletalAnimation = {
    /**
     * Starts a movement, easing into it over `fade` seconds. Called with nothing, it carries on
     * with whatever was paused.
     */
    play(clip?: string, options?: { fade?: number }): void;
    /**
     * Holds it where it is. It keeps standing in the pose it was in.
     */
    pause(): void;
    /**
     * Stops, and puts the bones back the way the model was made.
     */
    stop(): void;
    setSpeed(speed: number): void;
    /**
     * Whether it goes round for ever. Takes effect on the movement playing now.
     */
    setLoop(loop: boolean): void;
    /**
     * Tells you when a movement that does not go round reaches its end: a swing, a death, a door
     * opening. Hand back what it returns to stop being told.
     */
    onEnd(listener: (clip: string) => void): () => void;
    /**
     * Tells you when a movement passes one of the moments marked on it, handing over what that
     * moment is called and which movement it was in. Hand back what it returns to stop being told.
     *
     * A moment is passed **once per time through**, whatever the frame rate: a long frame that
     * steps clean over it still counts it, because a blow that stops landing when the machine
     * stutters is worse than one that lands late. Marks are told in the order they were written,
     * and a movement running backwards passes none of them.
     */
    onEvent(listener: (event: string, clip: string) => void): () => void;
    readonly playing: boolean;
    readonly clip: string | null;
    /**
     * How far into it, in seconds.
     */
    readonly time: number;
};
