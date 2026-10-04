import { getActiveBox } from '../../store';
import { linear } from '../../math/easing';
import type { TEaseFn } from '../../math/easing';
import type { TTweenHandle, TTweenOptions, TTweenStarter } from './types/t_tween';

/**
 * One tween while it runs. Kept apart from the options the caller passed, which are never touched:
 * `yoyo` swaps the ends of the trip on every repeat, and doing that to the caller's object would
 * quietly rewrite what they wrote.
 */
type TRunningTween = {
    /**
     * The ends of the trip being made right now. `yoyo` swaps them between trips.
     */
    legFrom: number;
    legTo: number;
    duration: number;
    ease: TEaseFn;
    repeatsLeft: number;
    yoyo: boolean;
    onUpdate: (value: number) => void;
    onComplete?: () => void;
    /**
     * Seconds into the current trip.
     */
    elapsed: number;
    /**
     * Seconds still to wait before moving at all.
     */
    delayLeft: number;
    paused: boolean;
    done: boolean;
};

/**
 * Advances one tween by `delta` seconds.
 */
const advance = (tween: TRunningTween, delta: number): void => {
    let step = delta;

    // The wait comes out of the frame, not off a clock: a delay shorter than one frame uses up
    // what it needs and the rest of that same frame already counts as movement. Otherwise every
    // delay would silently round up to a whole frame.
    if (tween.delayLeft > 0) {
        if (tween.delayLeft >= step) {
            tween.delayLeft -= step;
            return;
        }
        step -= tween.delayLeft;
        tween.delayLeft = 0;
    }

    tween.elapsed += step;

    // `duration <= 0` is not an error: it is "be there now". Checked first so nothing divides by it.
    const arrived = tween.duration <= 0 || tween.elapsed >= tween.duration;
    const progress = arrived ? 1 : tween.elapsed / tween.duration;

    // Always measured from the two ends, never by adding a little each frame, so the last frame
    // lands exactly on `legTo` instead of near it.
    tween.onUpdate(tween.legFrom + (tween.legTo - tween.legFrom) * tween.ease(progress));

    if (!arrived) {
        return;
    }

    if (tween.repeatsLeft > 0) {
        if (tween.repeatsLeft !== Infinity) {
            tween.repeatsLeft -= 1;
        }
        tween.elapsed = 0;
        if (tween.yoyo) {
            const back = tween.legFrom;
            tween.legFrom = tween.legTo;
            tween.legTo = back;
        }
        return;
    }

    tween.done = true;
    tween.onComplete?.();
};

/**
 * Moves a number from one value to another over time, so something can slide in, grow, fade or
 * bounce without you writing the arithmetic for it every frame.
 *
 * Calling `useTween()` animates nothing by itself: it gives you back a function that starts tweens.
 * Call that function whenever you want one, while the scene is being built or later from a key
 * press, and it hands you the controls to that particular tween: pause it, resume it, throw it away
 * or send it straight to the end.
 *
 * What is animated is a plain number. The tween gives it to you every frame in `onUpdate` and you
 * put it wherever it belongs, which is why the same hook moves a sprite, widens a loading bar or
 * mixes two colours.
 *
 * Tweens belong to the scene that started them: they freeze while it is paused, they run in slow
 * motion when the game does, and they are gone when it leaves. There is nothing to clean up.
 *
 * @returns A function that starts a tween and hands back its controls.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const hero = createSprite({ key: 'hero', transform: { x: 40, y: 112 } });
 *     const tween = useTween();
 *
 *     // There and back for ever, landing with a bounce on each end
 *     tween({
 *         from: 40,
 *         to: 420,
 *         duration: 1.5,
 *         ease: easeOutBounce,
 *         yoyo: true,
 *         repeat: -1,
 *         onUpdate: (x) => { hero.transform.x = x; },
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useTween = (): TTweenStarter => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useTween: call it inside a scene body, not from a timer or a callback.');
    }

    const running: TRunningTween[] = [];

    // One callback for every tween started from here, not one each: the loop calls this once a
    // frame however many are in flight.
    box.updateCallbacks.push((delta) => {
        // A copy, taken before any of them moves, so a tween started from another one's
        // `onComplete` waits for the next frame. That is the same rule the tree of objects
        // already follows, and it is what keeps a chain of tweens from collapsing into one frame.
        for (const tween of [...running]) {
            if (tween.paused || tween.done) {
                continue;
            }
            advance(tween, delta);
        }

        // Backwards, so removing one does not make the loop skip the next.
        for (let i = running.length - 1; i >= 0; i -= 1) {
            if (running[i].done) {
                running.splice(i, 1);
            }
        }
    });

    return (options: TTweenOptions): TTweenHandle => {
        // A negative repeat means for ever, the usual convention for tweens. Turned into
        // Infinity here so the countdown in `advance` can never reach zero.
        const repeat = options.repeat ?? 0;

        const tween: TRunningTween = {
            legFrom: options.from,
            legTo: options.to,
            duration: options.duration,
            ease: options.ease ?? linear,
            repeatsLeft: repeat < 0 ? Infinity : repeat,
            yoyo: options.yoyo ?? false,
            onUpdate: options.onUpdate,
            onComplete: options.onComplete,
            elapsed: 0,
            delayLeft: options.delay ?? 0,
            paused: false,
            done: false,
        };

        running.push(tween);

        return {
            pause: () => { tween.paused = true; },
            resume: () => { tween.paused = false; },
            cancel: () => { tween.done = true; },
            finish: () => {
                if (tween.done) {
                    return;
                }
                tween.done = true;
                tween.onUpdate(tween.legTo);
                tween.onComplete?.();
            },
            get done() {
                return tween.done;
            },
        };
    };
};
