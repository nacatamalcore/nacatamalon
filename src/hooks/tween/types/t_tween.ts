import type { TEaseFn } from '../../../math/easing';

/**
 * One trip of a number: where it starts, where it ends, how long it takes and what to do with the
 * value along the way.
 *
 * A tween animates a **number**, not an object, and that is on purpose: `onUpdate` hands you the
 * value and you decide where it goes. Into an `x`, into a `width`, into the amount of one colour
 * mixed into another. Anything made of numbers can be animated without the tween knowing it exists.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTweenOptions = {
    /**
     * The value it starts at.
     */
    from: number;
    /**
     * The value it ends at.
     */
    to: number;
    /**
     * How many seconds one trip takes.
     */
    duration: number;
    /**
     * The shape of the movement: a function that takes how far along the trip is, from `0` to `1`,
     * and answers how far along the value should be. Default `linear`, which is the same speed all
     * the way. `easeOutBounce` lands and bounces, `easeOutElastic` overshoots and wobbles back.
     */
    ease?: TEaseFn;
    /**
     * Seconds to wait before it starts moving. Default `0`.
     */
    delay?: number;
    /**
     * How many **extra** times it runs after the first trip, so `1` means it goes twice. A negative
     * number means for ever. Default `0`.
     */
    repeat?: number;
    /**
     * Whether each repeat comes back the other way, there and back. Default `false`.
     */
    yoyo?: boolean;
    /**
     * Called every frame with the value right now. This is where you put it to use.
     */
    onUpdate: (value: number) => void;
    /**
     * Called once when the last trip ends. Never called if it repeats for ever.
     */
    onComplete?: () => void;
};

/**
 * The controls of one tween that is already running, handed back when you start it.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTweenHandle = {
    /**
     * Freezes it where it is. The value stays put until `resume`.
     */
    pause(): void;
    /**
     * Carries on from where `pause` left it, not from where the clock would have taken it.
     */
    resume(): void;
    /**
     * Stops it in silence, wherever it had got to. `onComplete` does **not** run: nothing finished,
     * so nothing is announced. This is how you throw a tween away.
     */
    cancel(): void;
    /**
     * Jumps straight to the end value, runs `onComplete` and stops.
     */
    finish(): void;
    /**
     * Whether it is over, whichever way it ended: by arriving, by `finish` or by `cancel`.
     */
    readonly done: boolean;
};

/**
 * Starts one tween and hands back its controls. This is what `useTween` gives you, and you can call
 * it as many times as you like: while the scene is being built, or later from a key press.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTweenStarter = (options: TTweenOptions) => TTweenHandle;
