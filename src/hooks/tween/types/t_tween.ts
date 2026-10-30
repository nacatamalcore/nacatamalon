import type { TEaseFn } from '../../../math/easing';

/**
 * One trip of a number: where it starts, where it ends, how long it takes and what to do with the
 * value along the way. Declared by `useTween`'s function, and moved by its `play()`.
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
 * One trip of the fields of an object: the object, where its fields end or how far they go, and how
 * long they take.
 *
 * `target` is the thing itself (the sprite) and `to` the path down to each number, not the object
 * that holds the numbers. The path is followed again every frame, so a `tint` swapped for a new one
 * halfway is the one that goes on fading.
 *
 * - **`to`** says where each field ends. Played again, it makes the same trip from the same start.
 * - **`by`** says how far each field goes. Played again, it goes that far again from wherever the
 *   field is: a knockback, a jump, a step along.
 *
 * @example
 * ```ts
 * declare const hero: TSprite;
 *
 * const tween = useTween();
 * tween({ target: hero, to: { transform: { x: 420 }, tint: { a: 0 } }, duration: 1 }).play();
 *
 * // Each play pushes it 12 pixels further back, from wherever it is.
 * const knockback = tween({ target: hero, by: { transform: { x: -12 } }, duration: 0.2 });
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
     * Where each field ends, by its path from `target`. It needs this, `by`, or both, for different
     * fields.
     */
    to?: TTweenFields<T>;
    /**
     * How far each field goes from where it starts, by its path from `target`.
     */
    by?: TTweenFields<T>;
    /**
     * Where each field starts. A field left out starts where it is the first time the tween moves,
     * after its `delay`: in a `tween.chain`, where the step before left it. A field moved `to`
     * keeps that start and goes back to it each time it is played again; one moved `by` starts from
     * where it is every time.
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
 * A tween, declared: the controls to play it, as many times as you like, and to hear how it goes.
 * Nothing moves until `play()`.
 *
 * What a tween inside a `tween.chain` or a `tween.all` hears is still told (its `onEnd` when its
 * step ends), but only the chain or the group is played, paused or stopped: those calls on what is
 * inside it are an error.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTweenHandle = {
    /**
     * Plays it from the beginning, whether it was never played, over, stopped, paused or playing:
     * a field moved `to` goes back to where its first play found it, and one moved `by` goes on
     * from where it is.
     *
     * Something that should not start again while it plays asks first:
     * `if (!door.playing) door.play()`.
     */
    play(): void;
    /**
     * Freezes it where it is. The value stays put until `resume`.
     */
    pause(): void;
    /**
     * Carries on from where `pause` left it, not from where the clock would have taken it.
     */
    resume(): void;
    /**
     * Stops it where it is. `onEnd` does **not** run: nothing finished, so nothing is announced.
     * `onStop` does. The values stay where they got to, and `reset()` takes them back to the start.
     * Playing it again starts from the beginning.
     */
    stop(): void;
    /**
     * Jumps straight to the end value, runs `onEnd` and stops. Not playing, it does nothing.
     */
    finish(): void;
    /**
     * Puts every value back where its last play started, stopping it first if it is playing (which
     * `onStop` hears). It stays declared, ready to play. Never played, it does nothing.
     */
    reset(): void;
    /**
     * Calls `listener` every time it ends: by arriving or by `finish`, never by `stop`. One that
     * repeats for ever only ends by `finish`. Can be called more than once, and from anywhere. Hands back what
     * stops listening.
     */
    onEnd(listener: () => void): () => void;
    /**
     * Calls `listener` each time it starts again, with how many times it has so far in this play:
     * `1` the first time a `repeat` begins, `2` the next. Not when it ends: that is `onEnd`. A chain
     * or a group goes through once, so it never says it. Hands back what stops listening.
     *
     * @example
     * ```ts
     * // A lamp that fades out and back for ever, and how many blinks it has made: two trips each.
     * let blinks = 0;
     * const blink = tween({ target: lamp, to: { tint: { a: 0 } }, duration: 0.3, yoyo: true, repeat: -1 });
     * blink.onRepeat((times) => { blinks = Math.floor(times / 2); });
     * blink.play();
     * ```
     */
    onRepeat(listener: (repeats: number) => void): () => void;
    /**
     * Calls `listener` when it is stopped before it ended, by `stop` or by `reset`. Hands back what
     * stops listening.
     */
    onStop(listener: () => void): () => void;
    /**
     * Whether it is playing: from `play` until it ends or is stopped, waiting out its `delay` or
     * paused included.
     */
    readonly playing: boolean;
};

/**
 * Declares one tween and hands back its controls. This is what `useTween` gives you, and you can
 * call it as many times as you like: while the scene is being built, or later from a key press.
 * What it declares moves when it is played.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTweenStarter = {
    (options: TTweenOptions): TTweenHandle;
    <T extends object>(options: TTweenTargetOptions<T>): TTweenHandle;
    /**
     * Tweens one after another, as one tween: playing it plays the first, and each one that ends
     * plays the next, the time one leaves over going to the next, so it lasts exactly what they
     * add up to. Its `onEnd` runs when the last has ended; `pause`, `stop` and `finish` act on the
     * one playing (`finish` runs every step left to its end, in order).
     *
     * - What goes in is played by the chain: tweens never played, and in no other chain or group.
     * - A step with no `from` starts where the step before left it.
     * - A chain is a tween like any other, so it goes into another chain or a `tween.all`.
     * - With none, it ends on the next frame after it is played, never at once.
     *
     * @example
     * ```ts
     * const open = tween.chain(
     *     tween({ target: door, to: { transform: { y: -40 } }, duration: 0.5 }),
     *     tween({ target: hero, to: { transform: { x: 300 } }, duration: 1 }),
     * );
     * open.onEnd(() => { scene.change('Next'); });
     * open.play();
     * ```
     */
    chain(...tweens: TTweenHandle[]): TTweenHandle;
    /**
     * Tweens at the same time, as one tween: playing it plays them all, and its `onEnd` runs once
     * the last of them has ended. `pause`, `stop` and `finish` act on all of them. Each can have its
     * own destination, duration and delay.
     *
     * - What goes in is played by the group: tweens never played, and in no other chain or group.
     * - A group is a tween like any other, so it goes into a `tween.chain` or another group.
     * - With none, it ends on the next frame after it is played, never at once.
     *
     * @example
     * ```ts
     * const drop = tween.all(...coins.map((coin, i) => tween({ target: coin, to: { transform: { y: 200 } }, duration: 0.4, delay: i * 0.05 })));
     * drop.onEnd(() => { scoreText.text = 'ALL IN'; });
     * drop.play();
     * ```
     */
    all(...tweens: TTweenHandle[]): TTweenHandle;
};
