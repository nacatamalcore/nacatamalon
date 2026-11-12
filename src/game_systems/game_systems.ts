import { newBox, rootOf, trackBoxGame } from '../box';
import { teardownBox } from '../box/teardown_box';
import { flushReady } from '../scene/flush_ready';
import { withActiveBox, withActiveGame, getActiveBox } from '../store';
import { runHookUpdates, runLateUpdates } from '../game/loop/runHookUpdates';
import { reportFrameError } from '../game/loop/report_frame_error';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';

/**
 * What a game system is: a body run once in each game that starts, with that game and a box of its
 * own active, so every hook that lives in a box or in the game works inside it (`useUpdate`,
 * `useLateUpdate`, `useCleanup`, `useReady`, `useGame`, `useTimer`, `useTween`, the input, the
 * stores). It returns nothing: it is no scene, and builds none.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameSystemFn = () => void;

/**
 * Every system the page knows, by name, in the order they were registered: the order each game
 * starts them in.
 */
const registered = new Map<string, TGameSystemFn>();

/**
 * The games running now, so a system registered while one runs is told it waits for the next.
 */
const running = new Set<TRuntimeStore>();

/**
 * The name of each system's box, so a hook that needs a scene can say which system called it.
 */
const systemNames = new WeakMap<TBox, string>();

/**
 * The systems already told they came too late, so each is told once.
 */
const toldLate = new Set<string>();

/**
 * The scenes built to be shown and not played: a tool laying a level out, its behaviours attached
 * and none of them run (`sceneFromDoc(..., { scripts: 'attach' })`).
 */
const shownOnly = new WeakSet<TBox>();

/**
 * Marks a scene as shown and not played, for as long as it runs.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const markShownOnly = (root: TBox): void => {
    shownOnly.add(root);
};

/**
 * Whether the game is being laid out rather than played: every scene running is one shown only. Its
 * systems are taken down then, listeners and all, as the scenes' own behaviours do not run, and
 * started again once the game is played.
 */
const beingLaidOut = (store: TRuntimeStore): boolean => {
    // A plain loop: it runs every frame of every game, and makes nothing.
    const scenes = store.get('world').scenes;
    if (scenes.length === 0) {
        return false;
    }
    for (let i = 0; i < scenes.length; i++) {
        if (!shownOnly.has(scenes[i]!)) {
            return false;
        }
    }
    return true;
};

/**
 * Registers a game system: code that belongs to the whole game rather than to a scene. Music that
 * goes on between levels, keys that work everywhere (M to mute, F for full screen), achievements, the
 * time played, analytics. Each game that starts after this runs `fn` once, before its first scene, in
 * a box of its own that no change of scene touches, and tears it down when the game ends, its
 * `useCleanup` with it. Called in `main.ts` before `createGame`; a plugin exports an install function
 * that calls it.
 *
 * It runs whatever scene the game starts on: a level played straight from the editor, a game made with
 * `initialScene`, a test that starts on the third level. A scene that launches the others would be
 * missing in all three.
 *
 * In each frame, the systems' `useUpdate` run before any scene's, and their `useLateUpdate` after
 * every scene's: a system gets things ready for the scenes and reads where they left them. A paused
 * game pauses its systems as well (`useGame().onPaused` tells one so); a paused scene does not.
 *
 * A system belongs to no scene, so the hooks that need one throw inside it (`useScene`, the cameras,
 * the lights, physics, `useRenderStyle`, `useFog`): what concerns the whole game is `useGame()`'s, and
 * what lasts goes in a store. It draws nothing: what it creates is not seen, so something always on
 * screen (a score) is a scene launched beside the levels. One that throws, starting or in a frame, is
 * reported and the game goes on without it.
 *
 * The same name with the same function does nothing, so an install called twice does nothing when
 * the body is made once, at the top of the module, and not inside the install; the same name with
 * another function throws. Registered while a game is running, it waits for the next game, and says
 * so once. A plugin starts the name with its own (`'nacatamalon-saves'`), so two never pick the same.
 * While a tool lays the game out rather than playing it (an editor's edit mode), its systems are
 * taken down, and started again, from the ones registered then, when it is played.
 *
 * @param name What the system is called: in warnings, and to tell two apart.
 * @param fn Its body, run once in each game.
 * @returns A function that takes it back out: games that start after that run without it; those
 * running keep it until they end, or until a tool lays them out and they are played again, when
 * their systems start over from the ones registered then.
 *
 * @example
 * ```ts
 * import { createGame, createScene, registerGameSystem, useAudio, useKeyboard, useUpdate } from 'nacatamalon';
 *
 * // M mutes the game wherever the player is. The body is made once, here.
 * const muteKey = () => {
 *     const keys = useKeyboard();
 *     const audio = useAudio();
 *     useUpdate(() => {
 *         if (keys.justPressed('m')) audio.setVolume(audio.getVolume() > 0 ? 0 : 1);
 *     });
 * };
 *
 * const Level1 = () => createScene();
 * const Level2 = () => createScene();
 *
 * registerGameSystem('mute-key', muteKey);
 * createGame('#app', { width: 320, height: 180 })({ Level1, Level2 });
 * ```
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const registerGameSystem = (name: string, fn: TGameSystemFn): (() => void) => {
    if (typeof name !== 'string' || name === '') {
        throw new Error('[NacatamalOn] registerGameSystem: a system needs a name, as in \'music\', or a plugin\'s own as in \'nacatamalon-saves\'.');
    }
    if (typeof fn !== 'function') {
        throw new Error(`[NacatamalOn] registerGameSystem: '${name}' has no body. Give it the function each game runs.`);
    }
    const known = registered.get(name);
    if (known !== undefined && known !== fn) {
        throw new Error(`[NacatamalOn] registerGameSystem: '${name}' is already registered with another function. Give this one a name of its own.`);
    }
    if (known === undefined) {
        registered.set(name, fn);
        if (aGameRuns() && !toldLate.has(name)) {
            toldLate.add(name);
            console.warn(`[NacatamalOn] registerGameSystem: '${name}' was registered after a game started, so it runs from the next game. Call its install function before createGame.`);
        }
    }
    return () => {
        if (registered.get(name) === fn) {
            registered.delete(name);
        }
    };
};

/**
 * Starts every registered system in `store`, in the order they were registered, before its first
 * scene. One whose body throws is said with its name and left out; the rest start. Also what makes
 * a system registered from now on wait for the next game.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const startGameSystems = (store: TRuntimeStore): void => {
    running.add(store);
    const started: TBox[] = [];
    // The ones registered now: one a body registers waits for the next game, as it is told.
    for (const [name, fn] of [...registered]) {
        const box = newBox(name);
        systemNames.set(box, name);
        trackBoxGame(box, store);
        try {
            const result = withActiveGame(store, () => withActiveBox(store, box, () => fn())) as unknown;
            if (typeof (result as { then?: unknown } | undefined)?.then === 'function') {
                throw new Error('it returned a promise. A system\'s function cannot be async: load what it needs with the useLoad… hooks, which return at once.');
            }
        } catch (error) {
            console.error(`[NacatamalOn] game system '${name}': it could not start, and the game goes on without it.`, error);
            teardownBox(box);
            // Gone for good, it and all it made, so nothing they set aside (a `useReady`) runs after all.
            markGone(box);
            continue;
        }
        if (drawsSomething(box)) {
            console.warn(`[NacatamalOn] game system '${name}': it made something to draw, and a system is drawn nowhere. Launch a scene of its own for what it shows.`);
        }
        started.push(box);
    }
    store.setState('world', { systems: started });
    // Whole now: what their `useReady` waited for. One that throws is said, and the game starts.
    if (store.get('world').boxStack.length === 0) {
        try {
            flushReady(store);
        } catch (error) {
            console.error('[NacatamalOn] game system: what one set aside for when it was ready threw, and the game goes on.', error);
        }
    }
};

/**
 * Whether a game is running on the page: started and neither destroyed nor stopped.
 */
const aGameRuns = (): boolean => {
    for (const store of running) {
        if (store.get('loop').destroyed) running.delete(store);
    }
    return running.size > 0;
};

/**
 * Marks a box and everything under it destroyed.
 */
const markGone = (box: TBox): void => {
    box.destroyed = true;
    for (const child of box.children) markGone(child);
};

/**
 * Whether anything in a system's box is made to be drawn.
 */
const drawsSomething = (box: TBox): boolean =>
    box.drawables.length > 0 || box.children.some(drawsSomething);

/**
 * Tears every system of `store` down, the last started first, after its scenes: their `useCleanup`
 * run with the game still in one piece.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stopGameSystems = (store: TRuntimeStore): void => {
    running.delete(store);
    takeDown(store);
};

/**
 * Tears a game's systems down, the last started first, and leaves it with none.
 */
const takeDown = (store: TRuntimeStore): void => {
    const systems = store.get('world').systems;
    for (let i = systems.length - 1; i >= 0; i--) {
        teardownBox(systems[i]!);
    }
    if (systems.length > 0) store.setState('world', { systems: [] });
};

/**
 * The games whose systems are down while a tool lays them out.
 */
const laidOut = new WeakSet<TRuntimeStore>();

/**
 * Keeps a game's systems in step with how it is shown: taken down when a tool starts laying it out
 * (every scene shown and not played), so not one of their listeners hears anything meanwhile, and
 * started again, from the beginning, when it is played. Once a frame, before anything else.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const followLayout = (store: TRuntimeStore): void => {
    if (!running.has(store)) {
        return;
    }
    // With no scene at all (a tool between stopping one and building the next, or a build that
    // threw) nothing is decided: the game stays as it was.
    if (store.get('world').scenes.length === 0) {
        return;
    }
    const now = beingLaidOut(store);
    if (now && !laidOut.has(store)) {
        laidOut.add(store);
        takeDown(store);
    } else if (!now && laidOut.has(store)) {
        laidOut.delete(store);
        startGameSystems(store);
    }
};

/**
 * Runs every system's `useUpdate` for this frame, each on its own so one that throws costs only
 * itself, and gathers the boxes whose `useLateUpdate` run after the scenes. Nothing made in a game
 * with no systems.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const runSystemUpdates = (store: TRuntimeStore, dt: number): TBox[][] | null => {
    const systems = store.get('world').systems;
    if (systems.length === 0) {
        return null;
    }
    const late: TBox[][] = [];
    for (const system of systems) {
        const own: TBox[] = [];
        late.push(own);
        try {
            runHookUpdates(system, dt, undefined, own);
        } catch (error) {
            own.length = 0;
            reportFrameError(store, error);
        }
    }
    return late;
};

/**
 * Runs every system's `useLateUpdate` for this frame, after every scene's.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const runSystemLateUpdates = (store: TRuntimeStore, late: TBox[][] | null, dt: number): void => {
    if (late === null) {
        return;
    }
    const systems = store.get('world').systems;
    for (let i = 0; i < late.length; i++) {
        try {
            runLateUpdates(late[i]!, dt, systems[i]?.time ?? 0);
        } catch (error) {
            reportFrameError(store, error);
        }
    }
};

/**
 * Throws, for a hook that needs a scene, when it is called inside a game system, which belongs to
 * none. Nothing outside a system.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sceneOnly = (hook: string): void => {
    const box = getActiveBox();
    if (box === null) {
        return;
    }
    const name = systemNames.get(rootOf(box));
    if (name !== undefined) {
        throw new Error(`[NacatamalOn] ${hook}: '${name}' is a game system, which belongs to no scene. Use useGame() for what concerns the whole game, or launch a scene of its own.`);
    }
};
