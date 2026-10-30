import { getActiveBox, getActiveGame } from '../../store';
import { linear } from '../../math/easing';
import type { TTweenHandle, TTweenOptions, TTweenStarter, TTweenTargetOptions } from './types/t_tween';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { firstTimeIn } from '../../utils/first_time_in';

/**
 * What every tween is inside, whether one trip, a chain or a group: the same few moves, so a chain
 * can hold a group and a group a chain without either knowing which it holds.
 *
 * Only the outermost one is moved by the scene's clock. The ones inside are moved by whoever holds
 * them, which is how a chain hands the time left over by one step to the next.
 */
type TNode = {
    /**
     * `playing` from `play` until it arrives, is stopped or is finished, paused or not.
     */
    state: 'idle' | 'playing';
    paused: boolean;
    /**
     * Whether `play` was ever called on it, or on whatever holds it: a chain only takes tweens that
     * have never moved.
     */
    played: boolean;
    /**
     * The chain or group it went into, if any. Then that one plays it, and nobody else may.
     */
    owned: boolean;
    /**
     * That chain or group itself, once it is made.
     */
    holder: TNode | null;
    /**
     * Counts every start. Whoever runs a listener and then carries on reads it first and again
     * after: a listener that started it again, or stopped it, has already decided what happens
     * next, and what was about to happen must not.
     */
    run: number;
    ends: Set<() => void>;
    repeatListeners: Set<(repeats: number) => void>;
    stops: Set<() => void>;
    /**
     * Starts a reproduction from its beginning. Nothing is written until it moves.
     */
    begin: () => void;
    /**
     * Moves it `delta` seconds. Answers the seconds left over once it has ended, which a chain gives
     * to its next step, or `-1` while it is still going.
     */
    step: (delta: number) => number;
    /**
     * Puts it at its end and ends it.
     */
    jump: () => void;
    /**
     * Stops it where it is, telling `onStop`.
     */
    halt: () => void;
    /**
     * Writes where its last reproduction started. With `moved` false, only what has a destination
     * goes back: what moves by an amount moves from wherever it is.
     */
    rewind: (moved: boolean) => void;
    /**
     * Leaves it, and whatever it holds, not playing, telling no one: what starting again over a
     * reproduction still going does to the one it replaces.
     */
    quiet: () => void;
    /**
     * Forgets where what moves by an amount started, for it and whatever it holds: a new play has
     * not moved it yet, so a `reset` before it does must not put it back where an older one began.
     */
    fresh: () => void;
};

/**
 * The node behind each handle given out, so `chain` and `all` can take them. Weak, so a tween nobody
 * keeps is not kept here either.
 */
const nodeOf = new WeakMap<TTweenHandle, TNode>();

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
const listen = <T>(listeners: Set<T>, listener: T): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/**
 * Ends a reproduction: the last value is already written, so only the announcements are left.
 */
const end = (node: TNode): void => {
    node.state = 'idle';
    announce(node.ends);
};

/**
 * Whether it, or whatever holds it, is paused. Only the outermost can be paused by hand, so one
 * inside asks up the line.
 */
const held = (node: TNode): boolean => {
    for (let at: TNode | null = node; at !== null; at = at.holder) {
        if (at.paused) return true;
    }
    return false;
};

/**
 * What a node starts as: never played, in nothing, with no one listening.
 */
const blank = (): Pick<TNode, 'state' | 'paused' | 'played' | 'owned' | 'holder' | 'run' | 'ends' | 'repeatListeners' | 'stops'> => ({
    state: 'idle',
    paused: false,
    played: false,
    owned: false,
    holder: null,
    run: 0,
    ends: new Set(),
    repeatListeners: new Set(),
    stops: new Set(),
});

/**
 * How one trip writes its values: where the trip is, through the easing, and which way it goes.
 */
type TWriter = {
    /**
     * Where each value starts and ends, read when it starts moving.
     */
    begin: () => void;
    write: (eased: number, forward: boolean) => void;
    rewind: (moved: boolean) => void;
    fresh: () => void;
};

/**
 * One trip of a number or of fields, with its delay and its repeats.
 */
const tripNode = (options: TTweenOptions | TTweenTargetOptions<object>, writer: TWriter): TNode => {
    // A negative repeat means for ever, the usual convention for tweens. Turned into Infinity here
    // so the countdown can never reach zero.
    const repeat = options.repeat ?? 0;
    const repeatsFor = repeat < 0 ? Infinity : repeat;
    const duration = options.duration;
    const ease = options.ease ?? linear;
    const yoyo = options.yoyo ?? false;

    let forward = true;
    let begun = false;
    let elapsed = 0;
    let delayLeft = 0;
    let repeatsLeft = 0;
    let repeats = 0;

    const node: TNode = {
        ...blank(),
        begin: () => {
            node.state = 'playing';
            node.run += 1;
            forward = true;
            begun = false;
            elapsed = 0;
            delayLeft = options.delay ?? 0;
            repeatsLeft = repeatsFor;
            repeats = 0;
        },
        step: (delta) => {
            let left = delta;

            // The wait comes out of the frame, not off a clock: a delay shorter than one frame uses
            // up what it needs and the rest of that same frame already counts as movement.
            // Otherwise every delay would silently round up to a whole frame.
            if (delayLeft > 0) {
                if (delayLeft >= left) {
                    delayLeft -= left;
                    return -1;
                }
                left -= delayLeft;
                delayLeft = 0;
            }

            if (!begun) {
                begun = true;
                writer.begin();
            }

            elapsed += left;

            // `duration <= 0` is not an error: it is "be there now". Checked first so nothing
            // divides by it.
            const arrived = duration <= 0 || elapsed >= duration;
            const progress = arrived ? 1 : elapsed / duration;

            // Always measured from the two ends, never by adding a little each frame, so the last
            // frame lands exactly on the end instead of near it.
            writer.write(ease(progress), forward);

            if (!arrived) {
                return -1;
            }

            if (repeatsLeft > 0) {
                if (repeatsLeft !== Infinity) {
                    repeatsLeft -= 1;
                }
                elapsed = 0;
                if (yoyo) {
                    forward = !forward;
                }
                repeats += 1;
                // Over a copy, as the others are: a listener that stops listening does not skip
                // the next.
                for (const listener of [...node.repeatListeners]) {
                    listener(repeats);
                }
                return -1;
            }

            end(node);
            return Math.max(0, elapsed - Math.max(0, duration));
        },
        jump: () => {
            // Already over: a listener of its own end asking for the end again.
            if (node.state !== 'playing') return;
            if (!begun) {
                begun = true;
                writer.begin();
            }
            // The end of the last trip, not of this one: with `yoyo`, every repeat still to come
            // turns it round once more. One that repeats for ever has no last trip, and stops at
            // the end of the one it is on.
            const turns = yoyo && repeatsLeft !== Infinity ? repeatsLeft % 2 : 0;
            writer.write(1, turns === 0 ? forward : !forward);
            end(node);
        },
        halt: () => {
            node.state = 'idle';
            announce(node.stops);
        },
        rewind: (moved) => writer.rewind(moved),
        quiet: () => { node.state = 'idle'; },
        fresh: () => writer.fresh(),
    };
    return node;
};

/**
 * One number a target tween moves: the path to it from the target, and the two ends of its trip.
 */
type TField = {
    path: string[];
    /**
     * `to` names where it ends, `by` how far it goes from where it starts.
     */
    kind: 'to' | 'by';
    /**
     * The `to` or the `by`.
     */
    amount: number;
    /**
     * The `from`, when one was given.
     */
    given: number | null;
    /**
     * Where the reproduction moving it started, `null` until it first moves.
     */
    start: number | null;
    end: number;
};

/**
 * Every number named in a `to` or a `by`, with its path, and its `from` when one was given.
 */
const fieldsOf = (named: object, kind: TField['kind'], from: object | undefined, path: string[] = []): TField[] => {
    const fields: TField[] = [];
    for (const [key, value] of Object.entries(named)) {
        const at = [...path, key];
        const start = from !== undefined && from !== null ? (from as Record<string, unknown>)[key] : undefined;
        if (typeof value === 'number') {
            fields.push({ path: at, kind, amount: value, given: typeof start === 'number' ? start : null, start: null, end: 0 });
        } else if (value !== null && typeof value === 'object') {
            fields.push(...fieldsOf(value, kind, typeof start === 'object' && start !== null ? start : undefined, at));
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
 * The writer of a tween that moves the fields of an object.
 */
const targetWriter = (options: TTweenTargetOptions<object>): TWriter => {
    const fields = [...fieldsOf(options.to ?? {}, 'to', options.from), ...fieldsOf(options.by ?? {}, 'by', options.from)];
    if (fields.length === 0) {
        throw new Error('[NacatamalOn] tween: it has nothing to move. Give it a `to` with where each field ends, or a `by` with how far it goes.');
    }
    const named = new Set<string>();
    for (const field of fields) {
        const name = field.path.join('.');
        if (named.has(name)) {
            throw new Error(`[NacatamalOn] tween: '${name}' is in both \`to\` and \`by\`. Say where it ends or how far it goes, not both.`);
        }
        named.add(name);
    }

    const warned = new Set<string>();
    const warnOnce = (field: TField): void => {
        const name = field.path.join('.');
        if (warned.has(name)) return;
        warned.add(name);
        console.warn(`[NacatamalOn] tween: '${name}' is not a number on the target, so it is not moved.`);
    };
    const put = (field: TField, value: number): void => {
        const holder = holderOf(options.target, field.path);
        if (holder === null) {
            warnOnce(field);
            return;
        }
        holder[field.path[field.path.length - 1]] = value;
    };

    return {
        begin: () => {
            for (const field of fields) {
                const holder = holderOf(options.target, field.path);
                const now = holder === null ? null : holder[field.path[field.path.length - 1]] as number;
                if (field.kind === 'by') {
                    // From where it is each time: the same push, wherever it lands.
                    field.start = field.given ?? now;
                    field.end = field.start === null ? 0 : field.start + field.amount;
                } else {
                    // Read once, the first time, and kept: playing it again makes the same trip.
                    field.start = field.given ?? field.start ?? now;
                    field.end = field.amount;
                }
                if (field.start === null) {
                    warnOnce(field);
                }
            }
        },
        write: (eased, forward) => {
            for (const field of fields) {
                if (field.start === null) continue;
                const [a, b] = forward ? [field.start, field.end] : [field.end, field.start];
                put(field, a + (b - a) * eased);
            }
        },
        rewind: (moved) => {
            for (const field of fields) {
                if (field.start === null || (field.kind === 'by' && !moved)) continue;
                put(field, field.start);
            }
        },
        fresh: () => {
            for (const field of fields) {
                if (field.kind === 'by') field.start = null;
            }
        },
    };
};

/**
 * The writer of a tween that hands its number to `onUpdate`.
 */
const numberWriter = (options: TTweenOptions): TWriter => {
    let moved = false;
    return {
        begin: () => { moved = true; },
        write: (eased, forward) => {
            const [a, b] = forward ? [options.from, options.to] : [options.to, options.from];
            options.onUpdate(a + (b - a) * eased);
        },
        rewind: () => {
            if (moved) options.onUpdate(options.from);
        },
        fresh: () => {},
    };
};

/**
 * Tweens one after another. The time one leaves over goes to the next, so a chain lasts exactly
 * what its steps add up to.
 */
const chainNode = (steps: TNode[]): TNode => {
    let at = 0;

    const node: TNode = {
        ...blank(),
        begin: () => {
            node.state = 'playing';
            node.run += 1;
            at = 0;
            if (steps.length > 0) steps[0].begin();
        },
        step: (delta) => {
            const run = node.run;
            let left = delta;
            while (at < steps.length) {
                left = steps[at].step(left);
                // A step's `onEnd` may have stopped the chain, or started it again.
                if (node.run !== run || node.state !== 'playing') return -1;
                if (left < 0) return -1;
                at += 1;
                if (at < steps.length) {
                    steps[at].begin();
                    // Paused from that `onEnd`: the next step waits at its start, and the rest of
                    // the frame is after the pause, so it is not given to anyone.
                    if (held(node)) return -1;
                }
            }
            end(node);
            return left;
        },
        jump: () => {
            if (node.state !== 'playing') return;
            const run = node.run;
            while (at < steps.length) {
                // Asked from the `onEnd` of the step that just ended, before the chain moved on:
                // that one is over already, and the next is where the end is.
                if (steps[at].state === 'playing') steps[at].jump();
                if (node.run !== run || node.state !== 'playing') return;
                at += 1;
                if (at < steps.length) steps[at].begin();
            }
            end(node);
        },
        halt: () => {
            node.state = 'idle';
            const step = steps[at];
            if (step !== undefined && step.state === 'playing') step.halt();
            announce(node.stops);
        },
        rewind: (moved) => {
            // Last first, so a field two steps move ends where the first one found it.
            for (let i = steps.length - 1; i >= 0; i -= 1) steps[i].rewind(moved);
        },
        quiet: () => {
            node.state = 'idle';
            for (const step of steps) step.quiet();
        },
        fresh: () => {
            for (const step of steps) step.fresh();
        },
    };
    return node;
};

/**
 * Tweens at the same time. Over when the last of them is.
 */
const groupNode = (members: TNode[]): TNode => {
    const node: TNode = {
        ...blank(),
        begin: () => {
            node.state = 'playing';
            node.run += 1;
            for (const member of members) member.begin();
        },
        step: (delta) => {
            const run = node.run;
            // The one that ended last ended with the least time over, and that is when the group did.
            let least = delta;
            for (const member of members) {
                if (member.state !== 'playing') continue;
                const left = member.step(delta);
                if (node.run !== run || node.state !== 'playing') return -1;
                if (left >= 0) least = Math.min(least, left);
            }
            if (members.some((member) => member.state === 'playing')) return -1;
            end(node);
            return least;
        },
        jump: () => {
            if (node.state !== 'playing') return;
            const run = node.run;
            for (const member of members) {
                if (member.state === 'playing') member.jump();
                if (node.run !== run || node.state !== 'playing') return;
            }
            end(node);
        },
        halt: () => {
            node.state = 'idle';
            for (const member of members) {
                if (member.state === 'playing') member.halt();
            }
            announce(node.stops);
        },
        rewind: (moved) => {
            for (let i = members.length - 1; i >= 0; i -= 1) members[i].rewind(moved);
        },
        quiet: () => {
            node.state = 'idle';
            for (const member of members) member.quiet();
        },
        fresh: () => {
            for (const member of members) member.fresh();
        },
    };
    return node;
};

/**
 * Declares tweens: a number, or the fields of an object, going from one value to another over time,
 * so something can slide in, grow, fade or bounce without you writing the arithmetic for it every
 * frame.
 *
 * `useTween()` animates nothing by itself: it gives you back a function that declares tweens. A
 * tween declared does not move either. It waits, and moves each time you call its `play()`, as many
 * times as you like: declared once while the scene is built, played on every hit.
 *
 * - **Played again once it is over**, it makes the same trip again from the same start. Fields
 *   moved `by` an amount move it again from wherever they are.
 * - **`tween.chain(a, b, c)`** plays them one after another, and **`tween.all(a, b)`** at the same
 *   time. Both are tweens too, so one goes into the other. What goes into them is played by them:
 *   you play the chain, not its steps.
 *
 * What is animated is a plain number. The tween gives it to you every frame in `onUpdate` and you
 * put it wherever it belongs, which is why the same hook moves a sprite, widens a loading bar or
 * mixes two colours. Or it is given a `target` and the path to its fields, and moves them itself.
 *
 * Tweens belong to the scene that declared them: they freeze while it is paused, they run in slow
 * motion when the game does, and they are gone when it leaves. There is nothing to clean up.
 *
 * @returns A function that declares a tween and hands back its controls, with `chain` and `all` to
 * put several together.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const hero = createSprite({ key: 'hero', transform: { x: 40, y: 112 } });
 *     const door = createSprite({ key: 'door', transform: { x: 280, y: 112 } });
 *     const coin = createSprite({ key: 'coin', transform: { x: 160, y: 90 } });
 *     const tween = useTween();
 *
 *     // Up and down for ever, from the moment the scene starts
 *     tween({ target: coin, to: { transform: { y: 84 } }, duration: 0.6, ease: easeInOutSine, yoyo: true, repeat: -1 }).play();
 *
 *     // Declared once, played on every hit: two blinks and a step back at the same time
 *     const hurt = tween.all(
 *         tween({ target: hero, to: { tint: { a: 0 } }, duration: 0.08, yoyo: true, repeat: 3 }),
 *         tween({ target: hero, by: { transform: { x: -12 } }, duration: 0.2, ease: easeOutQuad }),
 *     );
 *     const keys = useKeyboard();
 *     useUpdate(() => {
 *         if (keys.justPressed('h')) hurt.play();
 *     });
 *
 *     // One after another: the door opens, then the hero walks through
 *     tween.chain(
 *         tween({ target: door, to: { transform: { y: -40 } }, duration: 0.5 }),
 *         tween({ target: hero, to: { transform: { x: 300 } }, duration: 1 }),
 *     ).play();
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
    const game = getActiveGame();

    // The outermost tweens playing. Each knows whether it is in here, so playing one twice in a
    // frame does not move it twice.
    const running: TNode[] = [];
    const listed = new WeakSet<TNode>();
    // Which frame each was played in, counted by this hook as its callback runs: one played from
    // these tweens' own listeners, or from anything that runs after this callback, moves from the
    // next frame, the rule the tree of objects follows. One played from a callback that runs
    // before this one in the same frame moves in it, as a timer started there does.
    const playedIn = new WeakMap<TNode, number>();
    let frame = 0;
    // Tweens declared after the scene was built, so far never played nor put in a chain.
    let unplayed: { node: TNode; frame: number }[] = [];

    // One callback for every tween declared from here, not one each: the loop calls this once a
    // frame however many are in flight.
    box.updateCallbacks.push((delta) => {
        frame += 1;

        if (unplayed.length > 0) {
            // Given a whole frame to be played or chained: a tween made from a callback and never
            // played is nearly always a `.play()` forgotten, and moves nothing without a word.
            unplayed = unplayed.filter((entry) => !entry.node.played && !entry.node.owned);
            if (unplayed.some((entry) => entry.frame < frame - 1) && firstTimeIn(game, 'tween: never played')) {
                console.warn('[NacatamalOn] tween: one was declared and never played, so it moves nothing. Call .play() on it, or put it in a tween.chain or tween.all and play that. A tween kept to be played later is declared while the scene is built.');
            }
            unplayed = unplayed.filter((entry) => entry.frame >= frame - 1);
        }

        for (const node of [...running]) {
            if (node.paused || node.state !== 'playing' || playedIn.get(node) === frame) {
                continue;
            }
            node.step(delta);
        }

        // Backwards, so removing one does not make the loop skip the next.
        for (let i = running.length - 1; i >= 0; i -= 1) {
            if (running[i].state !== 'playing') {
                listed.delete(running[i]);
                running.splice(i, 1);
            }
        }
    });

    const mustBeFree = (node: TNode): void => {
        if (node.owned) {
            throw new Error('[NacatamalOn] tween: this one is inside a tween.chain or a tween.all, which plays it. Play, pause or stop that one instead.');
        }
    };

    /**
     * The controls of a node: what `tween`, `chain` and `all` all hand back.
     */
    const handleOf = (node: TNode): TTweenHandle => {
        const handle: TTweenHandle = {
            play: () => {
                mustBeFree(node);
                // Over or not, it starts again from the beginning: what has a destination goes back
                // to where it started, and what moves by an amount moves from where it is.
                node.quiet();
                node.rewind(false);
                node.fresh();
                node.played = true;
                node.paused = false;
                node.begin();
                playedIn.set(node, frame);
                if (!listed.has(node)) {
                    listed.add(node);
                    running.push(node);
                }
            },
            pause: () => { mustBeFree(node); node.paused = true; },
            resume: () => { mustBeFree(node); node.paused = false; },
            stop: () => {
                mustBeFree(node);
                if (node.state === 'playing') node.halt();
            },
            finish: () => {
                mustBeFree(node);
                if (node.state === 'playing') node.jump();
            },
            reset: () => {
                mustBeFree(node);
                if (node.state === 'playing') node.halt();
                node.rewind(true);
            },
            onEnd: (listener) => listen(node.ends, listener),
            onRepeat: (listener) => listen(node.repeatListeners, listener),
            onStop: (listener) => listen(node.stops, listener),
            get playing() {
                return node.state === 'playing';
            },
        };
        nodeOf.set(handle, node);
        return handle;
    };

    const declare = (node: TNode): TTweenHandle => {
        // Declared from a callback rather than while the scene is built: watched for a forgotten play.
        if (getActiveBox() === null) {
            unplayed.push({ node, frame });
        }
        return handleOf(node);
    };

    const tween = (options: TTweenOptions | TTweenTargetOptions<object>): TTweenHandle =>
        declare(tripNode(options, 'target' in options ? targetWriter(options) : numberWriter(options)));

    /**
     * The nodes of tweens going into a chain or a group, each taken: never played, and in nothing yet.
     */
    const take = (what: string, handles: readonly TTweenHandle[]): TNode[] => handles.map((handle) => {
        const node = nodeOf.get(handle);
        if (node === undefined) {
            throw new Error(`[NacatamalOn] ${what}: one of these is not a tween. Give it what tween(...) hands back.`);
        }
        if (node.owned) {
            throw new Error(`[NacatamalOn] ${what}: one of these tweens is already in a tween.chain or a tween.all. A tween goes in one.`);
        }
        if (node.played) {
            throw new Error(`[NacatamalOn] ${what}: one of these tweens has been played already. Put it in before playing anything, and play the ${what === 'tween.chain' ? 'chain' : 'group'}.`);
        }
        node.owned = true;
        return node;
    });

    /**
     * Tells each node taken who holds it now.
     */
    const hold = (holder: TNode, nodes: readonly TNode[]): TNode => {
        for (const node of nodes) node.holder = holder;
        return holder;
    };

    const chain = (...handles: TTweenHandle[]): TTweenHandle => {
        const steps = take('tween.chain', handles);
        return declare(hold(chainNode(steps), steps));
    };
    const all = (...handles: TTweenHandle[]): TTweenHandle => {
        const members = take('tween.all', handles);
        return declare(hold(groupNode(members), members));
    };

    return Object.assign(tween, { chain, all }) as TTweenStarter;
};
