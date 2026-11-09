import { getActiveBox, bumpVersion, markWatchable } from '../../store';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { isGone } from '../../game/loop/runHookUpdates';
import type { TBox } from '../../box/types/t_box';
import { addDataRecord, takeSavedData } from './use_data';
import type { TDataRecord } from './use_data';

/**
 * What one state of a `useStateMachine` does: on the way in, every frame it lasts, and on the way
 * out. All three are optional, so a state that only waits to be left can be `{}`.
 *
 * @category State
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStateDef = {
    /**
     * Runs once, when the machine arrives in this state. For the starting state, on the first frame
     * rather than while the body runs, so whatever the body made is there by then.
     */
    onEnter?: () => void;
    /**
     * Runs every frame the machine is in this state, in the same pass as `useUpdate`, with the
     * seconds since the last frame. It does not run in a paused scene.
     */
    onUpdate?: (delta: number) => void;
    /**
     * Runs once, when the machine leaves this state for another. Not when its object is destroyed:
     * that is not a change of state, and `useCleanup` is there for it.
     */
    onExit?: () => void;
};

/**
 * How `go` can be asked to change state.
 *
 * @category State
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStateGoOptions = {
    /**
     * Leave and come back in when it is already in that state: `onExit` and `onEnter` run, and
     * `time` starts again from 0. A second punch of a combo is this. Without it, going to the state
     * it is in does nothing.
     */
    restart?: boolean;
};

/**
 * A state machine made by `useStateMachine`: which state it is in, for how long, and the way to
 * change it.
 *
 * It can be watched: `useWatch(fn, [machine])` runs whenever it changes state.
 *
 * @category State
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStateMachine<S extends string> = {
    /**
     * The state it is in now. A machine inside another's state (see `TStateMachineOptions`), while
     * that state is not the other's: the state it will enter, its `initial` unless `go` asked for
     * another.
     */
    readonly state: S;
    /**
     * Whether it is running. Always for a machine of its own; for one inside another's state, only
     * while the other is in that state.
     */
    readonly active: boolean;
    /**
     * The state it was in before this one, or `null` while it has never changed.
     */
    readonly previous: S | null;
    /**
     * Seconds it has been in the state it is in. They go at the scene's speed and stand still while
     * the scene is paused. 0 while it is not `active`.
     */
    readonly time: number;
    /**
     * Changes state: `onExit` of the one it leaves, then `onEnter` of the new one, then whoever
     * listens with `onChange`.
     *
     * Called from `onUpdate`, a key, a click or a signal, the change happens there and then; the new
     * state's `onUpdate` runs from the next frame. Called from inside a change (an `onEnter`, an
     * `onExit` or an `onChange`), it waits until that change is over, so a state is never left
     * halfway into it. Before the first frame, it only picks the state the machine starts in.
     *
     * Going to the state it is already in does nothing, unless `restart` is asked for.
     *
     * On a machine inside another's state that is not `active`, it takes the other there, and comes
     * in straight at this state rather than its `initial`: `combat.go('swing')` while the guard is
     * calm makes it go to combat, swinging.
     */
    go(state: S, options?: TStateGoOptions): void;
    /**
     * Whether it is in any of these states. Never while it is not `active`.
     */
    is(...states: S[]): boolean;
    /**
     * Runs `listener` after every change of state, with where it went and where it came from.
     *
     * @returns A function that stops listening.
     */
    onChange(listener: (to: S, from: S) => void): () => void;
};

/**
 * Where a machine lives inside another: in one of its states. It runs only while the other is
 * there, which is how a state gets states of its own.
 *
 * It is driven by the other: it updates in the other's frame, at the speed of the other's scene,
 * and stops when that scene is paused, wherever its own object is. One made while the other is
 * already running (a piece spawned during play) comes in on the other's next frame, never in the
 * middle of the body making it; until then `go` only picks where it will come in. Made while the
 * other's scene is paused, that next frame is the first one after it resumes.
 *
 * @category State
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStateMachineOptions<P extends string> = {
    /**
     * The machine it lives inside.
     */
    parent: TStateMachine<P>;
    /**
     * The state of `parent` it lives in.
     */
    state: NoInfer<P>;
};

/**
 * How many changes in a row, each asked for from inside the one before, count as two states
 * sending to each other forever rather than a long chain on purpose.
 */
const MAX_CHAIN = 16;

/**
 * What the machines of one family (a machine and those inside its states) share: whose turn it is
 * to change, and what was asked for meanwhile.
 */
type TFamily = {
    busy: boolean;
    started: boolean;
    queue: Array<{ run: () => boolean; said: () => string }>;
    // Counted by the machine at the top, at the start of each of its frames: a machine made in this
    // frame is fresh, and every body has ended by the next one.
    frame: number;
    // What fresh machines were asked to do, done at the start of the next frame.
    deferred: Array<{ by: object; run: () => void }>;
};

/**
 * A machine as the machines inside and around it see it.
 */
type TNode = {
    box: TBox;
    family: TFamily;
    names: readonly string[];
    has: (state: unknown) => boolean;
    isIn: (state: string) => boolean;
    isActive: () => boolean;
    isFresh: () => boolean;
    gone: () => boolean;
    forget: () => void;
    goNow: (state: string) => boolean;
    pick: (state: string) => void;
    enter: () => void;
    leave: () => void;
    step: (delta: number) => void;
    adopt: (state: string, child: TNode) => void;
    drop: (child: TNode) => void;
};

const nodes = new WeakMap<object, TNode>();

const quoted = (names: readonly string[]): string => names.map((name) => `'${name}'`).join(', ');

/**
 * A finite state machine that lives with a piece of the scene: a character that is standing,
 * running or jumping, an enemy that patrols, chases and goes back, a door, a boss, a level's
 * phases.
 *
 * Each state says what it does on the way in (`onEnter`), every frame it lasts (`onUpdate`) and on
 * the way out (`onExit`), and the machine is in exactly one of them at a time. The names come from
 * the object, so `go('jum')` is a type error.
 *
 * It is a hook like the rest, so it works wherever one does: the body of a scene, of a piece made
 * with `useSpawn` (a `Hero`), or of a behaviour. It belongs to that object: it runs with its
 * updates, in the order it was written among them, stops in a paused scene, and goes when the
 * object goes.
 *
 * The state it is in is saved with the object, like `useData`, and a scene opened again starts in
 * it (calling its `onEnter`), with the time it had been there.
 *
 * **States inside a state.** Given `{ parent, state }`, the machine lives inside that state of
 * another: it enters its `initial` when the other enters that state, and leaves when the other
 * leaves it, from the inside out (`onExit` of its state, then of the other's) and in from the
 * outside in. Each frame the other's `onUpdate` runs first, so what holds for the whole state (a
 * guard that has lost the hero leaves combat, whichever move it was in) is written once there, and
 * then its own. Each has its own names, `time` and `onChange`; a change asked for from inside a
 * change of any of them waits until that change is over. It can live in the same object as the
 * other or in a piece of its own, and another machine can live inside one of its states in turn.
 *
 * Call it in the body, like the rest of the hooks.
 *
 * @param initial The state it starts in, one of the names in `states`.
 * @param states Each state by name, with what it does.
 * @param options To live inside a state of another machine: `{ parent, state }`.
 *
 * @example
 * ```ts
 * declare const sheet: TSpriteAtlas;
 *
 * const Hero = ({ x, y }: { x: number; y: number }) => {
 *     const sprite = createSprite({ atlas: sheet, frame: 0, transform: { x, y } });
 *     const anim = useSpriteAnimation(sprite, {
 *         clips: {
 *             idle: { frames: [0, 1], fps: 4 },
 *             run: { frames: [2, 3, 4, 5], fps: 12 },
 *             jump: { frames: [6], fps: 1 },
 *             hurt: { frames: [7, 8], fps: 12, loop: false },
 *         },
 *         play: 'idle',
 *     });
 *     const keys = useKeyboard();
 *
 *     const hero = useStateMachine('idle', {
 *         idle: {
 *             onEnter: () => anim.play('idle'),
 *             onUpdate: () => {
 *                 if (keys.isDown('ArrowRight')) hero.go('run');
 *                 if (keys.justPressed('Space')) hero.go('jump');
 *             },
 *         },
 *         run: {
 *             onEnter: () => anim.play('run'),
 *             onUpdate: (delta) => {
 *                 sprite.transform.x += 90 * delta;
 *                 if (!keys.isDown('ArrowRight')) hero.go('idle');
 *             },
 *         },
 *         jump: {
 *             onEnter: () => anim.play('jump'),
 *             onUpdate: () => {
 *                 if (hero.time > 0.6) hero.go('idle');
 *             },
 *         },
 *         hurt: {
 *             onEnter: () => anim.play('hurt'),
 *             onUpdate: () => {
 *                 if (hero.time > 0.4) hero.go('idle');
 *             },
 *         },
 *     });
 *
 *     // What the level can ask of it.
 *     return { hurt: () => hero.go('hurt', { restart: true }) };
 * };
 *
 * export const Level: TSceneFn = () => {
 *     const hero = useSpawn(Hero, 'Hero')({ x: 40, y: 160 });
 *     usePointer().onDown(() => hero.api.hurt());
 *     return createScene();
 * };
 * ```
 *
 * @example
 * ```ts
 * declare const banner: TText;
 * declare const bossDefeated: TGameSignal<void>;
 *
 * // A scene's own phases.
 * export const Boss: TSceneFn = () => {
 *     const scene = useScene();
 *     const fight = useStateMachine('intro', {
 *         intro: {
 *             onEnter: () => { banner.text = 'READY?'; },
 *             onUpdate: () => { if (fight.time > 2) fight.go('fight'); },
 *         },
 *         fight: {
 *             onEnter: () => { banner.text = ''; },
 *         },
 *         won: {
 *             onEnter: () => { banner.text = 'YOU WIN'; },
 *             onUpdate: () => { if (fight.time > 3) scene.change('Map'); },
 *         },
 *     });
 *
 *     useSignal(bossDefeated, () => fight.go('won'));
 *     useWatch(() => console.log('now', fight.state), [fight]);
 *
 *     return createScene();
 * };
 * ```
 *
 * @example
 * ```ts
 * declare const lostHero: () => boolean;
 *
 * // States inside a state: the guard is calm or in combat, and each has moves of its own.
 * const guard = useStateMachine('calm', {
 *     calm: {},
 *     combat: {
 *         // Holds for every move of the combat, written once.
 *         onUpdate: () => { if (lostHero()) guard.go('calm'); },
 *     },
 * });
 *
 * const calm = useStateMachine('patrol', {
 *     patrol: {},
 *     search: { onUpdate: () => { if (calm.time > 2) calm.go('back'); } },
 *     back: {},
 * }, { parent: guard, state: 'calm' });
 *
 * const combat = useStateMachine('approach', {
 *     approach: {},
 *     swing: {},
 *     recover: { onUpdate: () => { if (combat.time > 0.5) combat.go('approach'); } },
 * }, { parent: guard, state: 'combat' });
 *
 * // From anywhere: into combat, straight at a swing.
 * combat.go('swing');
 * ```
 *
 * @returns The machine: `state`, `active`, `previous`, `time`, `go`, `is` and `onChange`.
 *
 * @category State
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useStateMachine = <S extends string, P extends string = never>(
    initial: NoInfer<S>,
    states: Record<S, TStateDef>,
    options?: TStateMachineOptions<P>,
): TStateMachine<S> => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useStateMachine');
    }

    const names = Object.keys(states) as S[];
    if (names.length === 0) {
        throw new Error("[NacatamalOn] useStateMachine: it was given no states. Give it at least the one it starts in: useStateMachine('idle', { idle: {} }).");
    }
    const known = (name: unknown): name is S => typeof name === 'string' && Object.prototype.hasOwnProperty.call(states, name);
    if (!known(initial)) {
        throw new Error(`[NacatamalOn] useStateMachine: it starts in '${String(initial)}', which is not one of its states: ${quoted(names)}.`);
    }

    // Where it lives, if inside another's state.
    let parent: TNode | null = null;
    let home = '';
    if (options !== undefined) {
        const found = nodes.get(options.parent as object);
        if (found === undefined) {
            throw new Error('[NacatamalOn] useStateMachine: its parent is not a state machine. Give it what another useStateMachine returned: { parent: guard, state: \'combat\' }.');
        }
        if (!found.has(options.state)) {
            throw new Error(`[NacatamalOn] useStateMachine: it lives in '${String(options.state)}', which is not one of its parent's states: ${quoted(found.names)}.`);
        }
        parent = found;
        home = options.state;
    }
    // One family, one turn: a change asked for from inside a change of any of them waits for it.
    const family: TFamily = parent?.family ?? { busy: false, started: false, queue: [], frame: 0, deferred: [] };

    let current: S = initial;
    let previous: S | null = null;
    let time = 0;
    let active = parent === null;
    // Inside another's state: where it comes in next time, and the time it had, when not `initial`.
    let entry: S | null = null;
    let entryTime = 0;
    // Made while its family was already running: it comes in on its parent's next frame, never in
    // the middle of the body that is making it.
    const bornAt = parent !== null && family.started ? family.frame : -1;
    const isFresh = (): boolean => bornAt === family.frame;
    // Counts its own changes, so a frame can tell it changed even into the same state (a restart).
    let turns = 0;
    const listeners: Array<(to: S, from: S) => void> = [];
    const children = new Map<string, TNode[]>();

    // Rebuilt from a document: it starts where it was saved, with the time it had been there.
    const restored = takeSavedData(box);
    if (restored !== null) {
        const saved = restored.value as { state?: unknown; time?: unknown } | null;
        if (saved !== null && typeof saved === 'object' && known(saved.state)) {
            const savedTime = typeof saved.time === 'number' && Number.isFinite(saved.time) && saved.time > 0 ? saved.time : 0;
            if (parent === null) {
                current = saved.state;
                time = savedTime;
            } else {
                entry = saved.state;
                entryTime = savedTime;
            }
        } else {
            const said = saved !== null && typeof saved === 'object' && typeof saved.state === 'string' ? `'${saved.state}'` : 'something that is not a state';
            console.warn(`[NacatamalOn] useStateMachine: it was saved in ${said}, which is not one of its states (${quoted(names)}), so it starts in '${initial}'.`);
        }
    }

    // Gone, itself or the machine it lives in.
    const gone = (): boolean => isGone(box) || (parent !== null && parent.gone());

    const childrenOf = (state: S): TNode[] => [...(children.get(state) ?? [])].filter((child) => !child.gone());

    // The ones made in this frame wait for the next.
    const enterChildren = (state: S): void => {
        for (const child of childrenOf(state)) {
            // Asked again for each: one before it may have destroyed it on the way in.
            if (!child.isActive() && !child.isFresh() && !child.gone()) {
                child.enter();
            }
        }
    };

    // Left with its parent: what the machines inside were told to come in at no longer holds.
    const forgetChildren = (state: S): void => {
        for (const child of childrenOf(state)) {
            if (!child.isActive()) {
                child.forget();
            }
        }
    };

    // What the machines inside its other states had been told to start in no longer holds.
    const forgetOthers = (keep: S): void => {
        for (const [state, list] of children) {
            if (state !== keep) {
                for (const child of list) {
                    child.forget();
                }
            }
        }
    };

    // From the inside out, the last one in first.
    const leaveChildren = (state: S): void => {
        for (const child of childrenOf(state).reverse()) {
            // Asked again for each: one before it may have destroyed it on the way out.
            if (child.isActive() && !child.gone()) {
                child.leave();
            }
        }
    };

    // Each step checks the object is still there: an `onExit` that destroys it (a guard that dies
    // on the way out of its last state) ends the change there, so nothing enters, plays or spawns
    // for an object that is gone.
    const change = (to: S): void => {
        const from = current;
        leaveChildren(from);
        forgetChildren(from);
        if (gone()) {
            return;
        }
        states[from].onExit?.();
        if (gone()) {
            return;
        }
        previous = from;
        current = to;
        time = 0;
        turns += 1;
        bumpVersion(machine);
        states[to].onEnter?.();
        if (gone()) {
            return;
        }
        enterChildren(to);
        // Asked before each listener: a machine inside, or a listener before, may have destroyed it.
        for (const listener of [...listeners]) {
            if (gone()) {
                return;
            }
            listener(to, from);
        }
    };

    // Runs `first` and then every change asked for while it ran, in any machine of the family, in
    // order, each of them allowed to ask for more. Whatever throws, the family can change again.
    const settle = (first: () => void): void => {
        family.busy = true;
        try {
            first();
            let chain = 0;
            while (family.queue.length > 0) {
                const next = family.queue.shift()!;
                const said = next.said();
                if (!next.run()) {
                    continue;
                }
                chain += 1;
                if (chain > MAX_CHAIN) {
                    throw new Error(
                        `[NacatamalOn] useStateMachine: ${said} keep sending to each other, ` +
                        `${MAX_CHAIN} changes in a row without a frame in between. ` +
                        'One of them should wait for something (a key, a hit, its time) in onUpdate before it calls go().',
                    );
                }
            }
        } finally {
            family.busy = false;
            family.queue.length = 0;
        }
    };

    // The change itself, inside a turn of the family. Whether anything changed.
    const goNow = (to: S, restart: boolean): boolean => {
        if (gone()) {
            return false;
        }
        if (!active) {
            // Still in the frame it was made in: done at the start of the next one.
            if (isFresh()) {
                entry = to;
                entryTime = 0;
                family.deferred.push({ by: machine, run: () => { goNow(to, restart); } });
                return false;
            }
            // Not running: the parent is taken to where this lives, and this comes in at `to`.
            if (entry !== to) {
                entry = to;
                entryTime = 0;
            }
            if (parent!.isIn(home)) {
                // Already there, and this was made since: it comes in now.
                enter();
                return true;
            }
            return parent!.goNow(home);
        }
        if (to === current && !restart) {
            return false;
        }
        change(to);
        return true;
    };

    // Comes in, as its parent enters where it lives: at `entry` if asked, else at `initial`.
    const enter = (): void => {
        // Nothing comes in for an object that is gone.
        if (gone()) {
            return;
        }
        active = true;
        turns += 1;
        current = entry ?? initial;
        time = entryTime;
        entry = null;
        entryTime = 0;
        bumpVersion(machine);
        states[current].onEnter?.();
        if (gone()) {
            return;
        }
        enterChildren(current);
    };

    // Goes, as its parent leaves where it lives: from the inside out, and ready to come in again.
    const leave = (): void => {
        // Destroying is not leaving: an object that is gone has no onExit.
        if (gone()) {
            return;
        }
        leaveChildren(current);
        forgetChildren(current);
        if (gone()) {
            return;
        }
        states[current].onExit?.();
        active = false;
        previous = current;
        current = initial;
        time = 0;
        turns += 1;
        bumpVersion(machine);
    };

    // A frame: its own update, then, if it is still in the same state, the machines inside it.
    const step = (delta: number): void => {
        time += delta;
        const at = current;
        const mark = turns;
        // Whether it is still where this frame started, without having left even for a moment.
        const still = (): boolean => active && turns === mark && !gone();
        states[at].onUpdate?.(delta);
        if (!still()) {
            return;
        }
        for (const child of childrenOf(at)) {
            // Destroyed by one before it, this frame.
            if (child.gone()) {
                continue;
            }
            if (!child.isActive()) {
                // Made in this frame: it comes in on the next one.
                if (child.isFresh()) {
                    continue;
                }
                // Made while this was already here: it comes in now, and runs from the next frame.
                run(() => {
                    if (!child.isActive() && !child.gone() && active && current === at) {
                        child.enter();
                    }
                });
            } else {
                child.step(delta);
            }
            if (!still()) {
                return;
            }
        }
    };

    // Inside a turn already: after it. Otherwise: a turn of its own.
    const run = (fn: () => void): void => {
        if (family.busy) {
            family.queue.push({ run: () => { fn(); return true; }, said: () => 'its states' });
        } else {
            settle(fn);
        }
    };

    const go = (to: S, goOptions?: TStateGoOptions): void => {
        if (!known(to)) {
            throw new Error(`[NacatamalOn] useStateMachine: go('${String(to)}'), but it has no state by that name. Its states are ${quoted(names)}.`);
        }
        // Destroyed this frame and not swept yet, itself, what it hangs from or the machine it lives
        // in: it is gone, the same way it stops updating.
        if (gone()) {
            return;
        }
        const restart = goOptions?.restart === true;
        if (!family.started) {
            // Nothing has been entered yet, so there is nothing to leave: it only picks where it starts.
            if (parent === null) {
                if (to !== current) {
                    current = to;
                    time = 0;
                    bumpVersion(machine);
                }
            } else {
                if (entry !== to) {
                    entry = to;
                    entryTime = 0;
                }
                bumpVersion(machine);
                parent.pick(home);
            }
            forgetOthers(to);
            return;
        }
        // Made in this frame and not running: it only picks where it will come in, and the rest is
        // done at the start of the next frame, once the body making it has ended.
        if (!active && isFresh()) {
            if (entry !== to) {
                entry = to;
                entryTime = 0;
            }
            bumpVersion(machine);
            family.deferred.push({ by: machine, run: () => { goNow(to, restart); } });
            return;
        }
        if (family.busy) {
            family.queue.push({ run: () => goNow(to, restart), said: () => `'${current}' and '${to}'` });
            return;
        }
        settle(() => goNow(to, restart));
    };

    const machine: TStateMachine<S> = {
        get state() {
            return !active && entry !== null ? entry : current;
        },
        get active() {
            return active;
        },
        get previous() {
            return previous;
        },
        get time() {
            return active ? time : 0;
        },
        go,
        is: (...asked: S[]) => active && asked.includes(current),
        onChange: (listener) => {
            listeners.push(listener);
            return () => {
                const at = listeners.indexOf(listener);
                if (at !== -1) {
                    listeners.splice(at, 1);
                }
            };
        },
    };
    markWatchable(machine);

    const node: TNode = {
        box,
        family,
        names,
        has: (state) => known(state),
        isIn: (state) => active && current === state,
        isActive: () => active,
        isFresh,
        gone,
        forget: () => {
            entry = null;
            entryTime = 0;
            // And what it asked for in the frame it was made in: the parent left since.
            family.deferred = family.deferred.filter((deferred) => deferred.by !== machine);
            for (const list of children.values()) {
                for (const child of list) {
                    child.forget();
                }
            }
        },
        goNow: (state) => goNow(state as S, false),
        pick: (state) => go(state as S),
        enter,
        leave,
        step,
        adopt: (state, child) => {
            const list = children.get(state) ?? [];
            list.push(child);
            children.set(state, list);
        },
        drop: (child) => {
            for (const list of children.values()) {
                const at = list.indexOf(child);
                if (at !== -1) {
                    list.splice(at, 1);
                }
            }
        },
    };
    nodes.set(machine, node);
    parent?.adopt(home, node);

    // What is written down when the scene is saved, read fresh each time so the file never holds an
    // object the game keeps changing. Written to (a tool setting it), it goes there like `go`.
    const record = {
        get value(): unknown {
            return { state: machine.state, time: machine.time };
        },
        set value(next: unknown) {
            const asked = next as { state?: unknown; time?: unknown } | null;
            if (asked !== null && typeof asked === 'object' && known(asked.state)) {
                go(asked.state);
                // Only once it is there, or will come in there: a change still waiting, or an object
                // already gone, keeps its time.
                if (typeof asked.time === 'number' && Number.isFinite(asked.time) && asked.time >= 0) {
                    if (active && current === asked.state) {
                        time = asked.time;
                    } else if (!active && entry === asked.state) {
                        entryTime = asked.time;
                    }
                }
            }
        },
    } as TDataRecord<unknown>;
    addDataRecord(box, record);

    // Only a machine of its own is driven by the frame: one inside another is driven by it.
    if (parent === null) {
        box.updateCallbacks.push((delta) => {
            // Destroyed earlier this frame (a useUpdate before this one): not a frame for it.
            if (isGone(box)) {
                return;
            }
            family.frame += 1;
            // What machines made in the last frame asked for, now that their bodies have ended.
            if (family.started && family.deferred.length > 0) {
                const asked = family.deferred.splice(0);
                settle(() => {
                    for (const deferred of asked) {
                        deferred.run();
                    }
                });
                if (isGone(box)) {
                    return;
                }
            }
            if (!family.started) {
                family.started = true;
                settle(() => {
                    states[current].onEnter?.();
                    if (!isGone(box)) {
                        enterChildren(current);
                    }
                });
                if (isGone(box)) {
                    return;
                }
            }
            step(delta);
        });
    }

    box.cleanups.push(() => {
        listeners.length = 0;
        parent?.drop(node);
    });

    return machine;
};
