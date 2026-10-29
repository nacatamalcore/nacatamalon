import type { TEaseFn } from '../../../math/easing';

/**
 * One trip of a number: where it starts, where it ends, how long it takes and what to do with the
 * value along the way.
 *
 * A tween animates a **number**, not an object, and that is on purpose: `onUpdate` hands you the
 * value and you decide where it goes. Into an `x`, into a `width`, into the amount of one colour
 * mixed into another. Anything made of numbers can be animated without the tween knowing it exists.
 *
 * When what moves is a field of an object (a sprite's `x`, its `tint.a`), `TTweenTargetOptions`
 * says it shorter, with no `onUpdate` to write.
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
};

/**
 * Countdown for `TTweenFields`, so a path into an object stops a few levels down instead of walking
 * a sprite's texture and everything it holds.
 */
type TFieldDepth = [never, 0, 1, 2, 3];

/**
 * The fields of an object a tween can move, as a path to each: `{ transform: { x: 200 }, tint: { a: 0 } }`.
 * Only the ends that are numbers can be named; everything on the way is optional.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTweenFields<T, Depth extends number = 4> = [Depth] extends [never] ? never : {
    [K in keyof T]?: NonNullable<T[K]> extends number
        ? number
        : NonNullable<T[K]> extends (...args: never[]) => unknown
            ? never
            : NonNullable<T[K]> extends object
                ? TTweenFields<NonNullable<T[K]>, TFieldDepth[Depth]>
                : never;
};

/**
 * One trip of the fields of an object: the object, where its fields end, and how long they take.
 *
 * `target` is the thing itself (the sprite) and `to` the path down to each number, not the object
 * that holds the numbers. The path is followed again every frame, so a `tint` swapped for a new one
 * halfway is the one that goes on fading.
 *
 * @example
 * ```ts
 * declare const hero: TSprite;
 *
 * const tween = useTween();
 * tween({ target: hero, to: { transform: { x: 420 }, tint: { a: 0 } }, duration: 1 });
 * ```
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTweenTargetOptions<T extends object> = {
    /**
     * What is moved: a sprite, a text, a box, any object with numbers in it.
     */
    target: T;
    /**
     * Where each field ends, by its path from `target`.
     */
    to: TTweenFields<T>;
    /**
     * Where each field starts. A field left out starts where it is when the tween starts moving,
     * after its `delay`: a tween started when another one ends picks up where that one left it.
     */
    from?: TTweenFields<T>;
    /**
     * How many seconds one trip takes.
     */
    duration: number;
    /**
     * The shape of the movement, as in `TTweenOptions`. Default `linear`.
     */
    ease?: TEaseFn;
    /**
     * Seconds to wait before it starts moving. Default `0`.
     */
    delay?: number;
    /**
     * How many **extra** times it runs after the first trip. A negative number means for ever.
     * Default `0`.
     */
    repeat?: number;
    /**
     * Whether each repeat comes back the other way, there and back. Default `false`.
     */
    yoyo?: boolean;
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
     * Stops it in silence, wherever it had got to. `onEnd` does **not** run: nothing finished,
     * so nothing is announced. This is how you throw a tween away. Only `onCancel` hears it.
     */
    cancel(): void;
    /**
     * Jumps straight to the end value, runs `onEnd` and stops.
     */
    finish(): void;
    /**
     * Calls `listener` when it ends: by arriving or by `finish`, never by `cancel`, and never if it
     * repeats for ever. It is how what comes after a tween is chained, as it is for an animation
     * or a motion. Can be called more than once, and from anywhere, which is what lets `all` wait
     * for tweens someone else started. Hands back what stops listening.
     */
    onEnd(listener: () => void): () => void;
    /**
     * Calls `listener` each time it starts again, with how many times it has so far: `1` the first
     * time a `repeat` begins, `2` the next. Not when it ends: that is `onEnd`. A tween made with
     * `all` goes through once, so it never says it. Hands back what stops listening.
     *
     * @example
     * ```ts
     * // A lamp that fades out and back for ever, and how many blinks it has made: two trips each.
     * let blinks = 0;
     * tween({ target: lamp, to: { tint: { a: 0 } }, duration: 0.3, yoyo: true, repeat: -1 })
     *     .onRepeat((times) => { blinks = Math.floor(times / 2); });
     * ```
     */
    onRepeat(listener: (repeats: number) => void): () => void;
    /**
     * Calls `listener` when it is cancelled before it ended. Hands back what stops listening.
     */
    onCancel(listener: () => void): () => void;
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
export type TTweenStarter = {
    (options: TTweenOptions): TTweenHandle;
    <T extends object>(options: TTweenTargetOptions<T>): TTweenHandle;
    /**
     * Several tweens as one: a handle whose `onEnd` runs once the last of them has ended, and whose
     * `pause`, `resume`, `cancel` and `finish` act on all of them. Each can have its own
     * destination, duration and delay.
     *
     * - With none, or all of them already over, it ends on the next frame, never at once: its
     *   `onEnd` is added after it is made, and would otherwise be missed.
     * - If one of them is cancelled it never ends: its `onCancel` runs, once, and the others carry
     *   on until they are cancelled too.
     * - A group is a handle like any other, so it can go into another `all`.
     *
     * @example
     * ```ts
     * const drops = coins.map((coin, i) => tween({ target: coin, to: { transform: { y: 200 } }, duration: 0.4, delay: i * 0.05 }));
     * tween.all(drops).onEnd(() => { scoreText.text = 'ALL IN'; });
     * ```
     */
    all(handles: readonly TTweenHandle[]): TTweenHandle;
};
