import type { TClipEvent } from '../../../animation';

/**
 * How one movement of a model plays: what its sprite twin, `TAnimationClip`, says on the clip, said
 * here because **a glTF file has nowhere to put it**. The format says what moves and when, and
 * nothing about whether it goes round or what any moment of it means. Somebody has to decide, once
 * for each movement, and this is where.
 *
 * Left out, a field is the animator's own (`loop`, `repeat`, `yoyo` of the options).
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSkeletalClipOptions = {
    /**
     * Whether it goes round for ever. A `repeat` says how many times instead.
     */
    loop?: boolean;
    /**
     * How many **extra** times it runs after the first: `2` is three times, then it ends, telling
     * `onEnd`. Negative is for ever. Given, `loop` is not looked at.
     */
    repeat?: number;
    /**
     * Whether each time it runs again it comes back the other way.
     */
    yoyo?: boolean;
    /**
     * Moments inside it worth being told about: the instant a blow lands, a foot meets the ground, a
     * spell leaves the hand. **`at` is in seconds from its start**, because a movement off a file is
     * a continuous thing with no pictures in it to count. Passed on the way there, not on the way
     * back.
     */
    events?: readonly TClipEvent[];
    /**
     * The movement to play when this one ends, eased into by the animator's `fade`: an attack that
     * goes back to standing. A name the file has no movement for is said once, and it rests where it
     * ended.
     */
    next?: string;
};

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
     * Whether a movement goes round for ever. Default `true`. A `repeat` says how many times instead.
     * One movement's own, in `clips`, comes first.
     */
    loop?: boolean;
    /**
     * How many **extra** times a movement runs after the first, as a tween's `repeat`: `2` is three
     * times, then it ends, telling `onEnd`. A negative number means for ever. Given, it says it and
     * `loop` is not looked at. One movement's own, in `clips`, comes first.
     */
    repeat?: number;
    /**
     * Whether each time a movement runs again it comes back the other way, as a tween's `yoyo`: a
     * breath, a sway, a door that swings to and fro, from a movement that only goes one way. Marks
     * are passed on the way there, not on the way back. Default `false`. One movement's own, in
     * `clips`, comes first.
     */
    yoyo?: boolean;
    /**
     * How fast, as a multiple. Default `1`.
     */
    speed?: number;
    /**
     * How long to take easing into a new movement, in seconds. Default `0`, which is a cut.
     */
    fade?: number;
    /**
     * How each movement plays, by its name in the file: whether it goes round, how many times, what
     * comes after it and the moments worth being told about. A movement not named here plays as the
     * options above say. See `TSkeletalClipOptions`.
     *
     * @example
     * ```ts
     * useSkeletalAnimation(fighter, {
     *     play: 'Idle',
     *     clips: {
     *         Death: { loop: false },
     *         Attack: { loop: false, next: 'Idle', events: [{ at: 0.42, name: 'hit' }] },
     *         Breathe: { yoyo: true },
     *     },
     * });
     * ```
     */
    clips?: Readonly<Record<string, TSkeletalClipOptions>>;
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
     * Tells you each time a movement starts again, with how many times it has so far: `1` the first
     * time it goes round. Not when it ends, which is `onEnd`. Hand back what it returns to stop being
     * told.
     */
    onRepeat(listener: (clip: string, repeats: number) => void): () => void;
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
