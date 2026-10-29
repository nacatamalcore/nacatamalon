import { getActiveBox } from '../../store';
import { linear } from '../../math/easing';
import type { TEaseFn } from '../../math/easing';
import type { TTweenHandle, TTweenOptions, TTweenStarter, TTweenTargetOptions } from './types/t_tween';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * How a tween stands: still going, ended (by arriving or by `finish`), or cancelled.
 */
type TTweenState = 'running' | 'ended' | 'cancelled';

/**
 * One tween while it runs. Kept apart from the options the caller passed, which are never touched:
 * `yoyo` swaps the ends of the trip on every repeat, and doing that to the caller's object would
 * quietly rewrite what they wrote.
 */
type TRunningTween = {
    /**
     * Whether the trip being made right now goes from the start to the end. `yoyo` flips it between
     * trips.
     */
    forward: boolean;
    /**
     * Puts the value where `eased` (how far along, through the easing) says, on the trip being made.
     */
    write: (eased: number, forward: boolean) => void;
    /**
     * Runs once, the first time it moves: where a field with no `from` reads where it is.
     */
    begin: () => void;
    begun: boolean;
    duration: number;
    ease: TEaseFn;
    repeatsLeft: number;
    yoyo: boolean;
    ends: Set<() => void>;
    cancels: Set<() => void>;
    /**
     * Seconds into the current trip.
     */
    elapsed: number;
    /**
     * Seconds still to wait before moving at all.
     */
    delayLeft: number;
    paused: boolean;
    state: TTweenState;
};

/**
 * How each handle handed out stands, so `all` can tell a tween that already ended (and will not say
 * so again) from one that was cancelled. Weak, so a handle nobody keeps is not kept here either.
 */
const stateOf = new WeakMap<TTweenHandle, () => TTweenState>();

/**
 * Runs every listener in a set, over a copy, so one that stops listening does not skip the next.
 */
const announce = (listeners: Set<() => void>): void => {
    for (const listener of [...listeners]) {
        listener();
    }
};

/**
 * Adds a listener and hands back what removes it.
 */
const listen = (listeners: Set<() => void>, listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/**
 * Ends a tween: the last value is already written, so only the announcements are left.
 */
const end = (tween: TRunningTween): void => {
    tween.state = 'ended';
    announce(tween.ends);
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

    if (!tween.begun) {
        tween.begun = true;
        tween.begin();
    }

    tween.elapsed += step;

    // `duration <= 0` is not an error: it is "be there now". Checked first so nothing divides by it.
    const arrived = tween.duration <= 0 || tween.elapsed >= tween.duration;
    const progress = arrived ? 1 : tween.elapsed / tween.duration;

    // Always measured from the two ends, never by adding a little each frame, so the last frame
    // lands exactly on the end instead of near it.
    tween.write(tween.ease(progress), tween.forward);

    if (!arrived) {
        return;
    }

    if (tween.repeatsLeft > 0) {
        if (tween.repeatsLeft !== Infinity) {
            tween.repeatsLeft -= 1;
        }
        tween.elapsed = 0;
        if (tween.yoyo) {
            tween.forward = !tween.forward;
        }
        return;
    }

    end(tween);
};

/**
 * One number a target tween moves: the path to it from the target, and the two ends of its trip.
 * `from` is `null` until the tween starts moving when it was not given.
 */
type TField = {
    path: string[];
    from: number | null;
    to: number;
};

/**
 * Every number named in a `to`, with its path, and its `from` when one was given.
 */
const fieldsOf = (to: object, from: object | undefined, path: string[] = []): TField[] => {
    const fields: TField[] = [];
    for (const [key, value] of Object.entries(to)) {
        const at = [...path, key];
        const start = from !== undefined && from !== null ? (from as Record<string, unknown>)[key] : undefined;
        if (typeof value === 'number') {
            fields.push({ path: at, from: typeof start === 'number' ? start : null, to: value });
        } else if (value !== null && typeof value === 'object') {
            fields.push(...fieldsOf(value, typeof start === 'object' && start !== null ? start : undefined, at));
        }
    }
    return fields;
};

/**
 * The object that holds the number at the end of `path`, followed from `root` again each time so
 * a part swapped for a new one is found. `null` when the path breaks or does not end in a number.
 */
const holderOf = (root: object, path: string[]): Record<string, unknown> | null => {
    let at: unknown = root;
    for (let i = 0; i < path.length - 1; i += 1) {
        at = (at as Record<string, unknown>)[path[i]];
        if (at === null || typeof at !== 'object') {
            return null;
        }
    }
    const holder = at as Record<string, unknown>;
    return typeof holder[path[path.length - 1]] === 'number' ? holder : null;
};

/**
 * The `write` and `begin` of a tween that moves the fields of an object.
 */
const targetWriter = (options: TTweenTargetOptions<object>): Pick<TRunningTween, 'write' | 'begin'> => {
    const fields = fieldsOf(options.to, options.from);
    const warned = new Set<string>();
    const warnOnce = (field: TField): void => {
        const name = field.path.join('.');
        if (warned.has(name)) return;
        warned.add(name);
        console.warn(`[NacatamalOn] useTween: '${name}' is not a number on the target, so it is not moved.`);
    };

    return {
        begin: () => {
            for (const field of fields) {
                if (field.from !== null) continue;
                const holder = holderOf(options.target, field.path);
                if (holder === null) {
                    warnOnce(field);
                    continue;
                }
                field.from = holder[field.path[field.path.length - 1]] as number;
            }
        },
        write: (eased, forward) => {
            for (const field of fields) {
                if (field.from === null) continue;
                const holder = holderOf(options.target, field.path);
                if (holder === null) {
                    warnOnce(field);
                    continue;
                }
                const [a, b] = forward ? [field.from, field.to] : [field.to, field.from];
                holder[field.path[field.path.length - 1]] = a + (b - a) * eased;
            }
        },
    };
};

/**
 * The `write` and `begin` of a tween that hands its number to `onUpdate`.
 */
const numberWriter = (options: TTweenOptions): Pick<TRunningTween, 'write' | 'begin'> => ({
    begin: () => {},
    write: (eased, forward) => {
        const [a, b] = forward ? [options.from, options.to] : [options.to, options.from];
        options.onUpdate(a + (b - a) * eased);
    },
});

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
 * mixes two colours. Or it is given a `target` and the path to its fields, and moves them itself.
 *
 * Tweens belong to the scene that started them: they freeze while it is paused, they run in slow
 * motion when the game does, and they are gone when it leaves. There is nothing to clean up.
 *
 * @returns A function that starts a tween and hands back its controls, with `all` to wait for
 * several.
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
 *     // The same hero, faded out by its own fields
 *     tween({ target: hero, to: { tint: { a: 0 } }, duration: 0.5 })
 *         .onEnd(() => { hero.visible = false; });
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
        throw outsideSceneBody('useTween');
    }

    const running: TRunningTween[] = [];

    // One callback for every tween started from here, not one each: the loop calls this once a
    // frame however many are in flight.
    box.updateCallbacks.push((delta) => {
        // A copy, taken before any of them moves, so a tween started from another one's
        // `onEnd` waits for the next frame. That is the same rule the tree of objects
        // already follows, and it is what keeps a chain of tweens from collapsing into one frame.
        for (const tween of [...running]) {
            if (tween.paused || tween.state !== 'running') {
                continue;
            }
            advance(tween, delta);
        }

        // Backwards, so removing one does not make the loop skip the next.
        for (let i = running.length - 1; i >= 0; i -= 1) {
            if (running[i].state !== 'running') {
                running.splice(i, 1);
            }
        }
    });

    const start = (options: TTweenOptions | TTweenTargetOptions<object>): TTweenHandle => {
        // A negative repeat means for ever, the usual convention for tweens. Turned into
        // Infinity here so the countdown in `advance` can never reach zero.
        const repeat = options.repeat ?? 0;

        const tween: TRunningTween = {
            ...('target' in options ? targetWriter(options) : numberWriter(options)),
            forward: true,
            begun: false,
            duration: options.duration,
            ease: options.ease ?? linear,
            repeatsLeft: repeat < 0 ? Infinity : repeat,
            yoyo: options.yoyo ?? false,
            ends: new Set(),
            cancels: new Set(),
            elapsed: 0,
            delayLeft: options.delay ?? 0,
            paused: false,
            state: 'running',
        };

        running.push(tween);

        const handle: TTweenHandle = {
            pause: () => { tween.paused = true; },
            resume: () => { tween.paused = false; },
            cancel: () => {
                if (tween.state !== 'running') {
                    return;
                }
                tween.state = 'cancelled';
                announce(tween.cancels);
            },
            finish: () => {
                if (tween.state !== 'running') {
                    return;
                }
                if (!tween.begun) {
                    tween.begun = true;
                    tween.begin();
                }
                tween.write(1, tween.forward);
                end(tween);
            },
            onEnd: (listener) => listen(tween.ends, listener),
            onCancel: (listener) => listen(tween.cancels, listener),
            get done() {
                return tween.state !== 'running';
            },
        };
        stateOf.set(handle, () => tween.state);
        return handle;
    };

    const all = (handles: readonly TTweenHandle[]): TTweenHandle => {
        const ends = new Set<() => void>();
        const cancels = new Set<() => void>();
        let state: TTweenState = 'running';

        const cancelled = handles.some((handle) => stateOf.get(handle)?.() === 'cancelled');
        // The ones still to end. With none left, a tween of nothing stands in for them, so the
        // group ends on the next frame, by the scene's clock, after its `onEnd` has been added.
        let pending = handles.filter((handle) => !handle.done);
        if (pending.length === 0 && !cancelled) {
            pending = [start({ from: 0, to: 0, duration: 0, onUpdate: () => {} })];
        }

        // Made already broken: nobody could have been listening yet, so it says nothing.
        if (cancelled) {
            state = 'cancelled';
        }

        const cancelGroup = (): void => {
            if (state !== 'running') return;
            state = 'cancelled';
            announce(cancels);
        };

        let left = pending.length;
        for (const handle of pending) {
            handle.onEnd(() => {
                left -= 1;
                if (left === 0 && state === 'running') {
                    state = 'ended';
                    announce(ends);
                }
            });
            handle.onCancel(cancelGroup);
        }

        const group: TTweenHandle = {
            pause: () => { for (const handle of pending) handle.pause(); },
            resume: () => { for (const handle of pending) handle.resume(); },
            cancel: () => {
                // Said once, before the members go, so their own cancelling finds it said.
                cancelGroup();
                for (const handle of pending) handle.cancel();
            },
            finish: () => {
                if (state !== 'running') return;
                for (const handle of pending) handle.finish();
            },
            onEnd: (listener) => listen(ends, listener),
            onCancel: (listener) => listen(cancels, listener),
            get done() {
                return state !== 'running';
            },
        };
        stateOf.set(group, () => state);
        return group;
    };

    return Object.assign(start, { all }) as TTweenStarter;
};
