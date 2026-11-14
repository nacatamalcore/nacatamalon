import { newBox, rootOf, trackBoxGame } from '../box';
import { teardownBox } from '../box/teardown_box';
import { flushReady } from '../scene/flush_ready';
import { gameBehindSplash, splashOf } from '../splash/behind_splash';
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
 * A system belongs to no scene, so the hooks that need one throw inside it (the cameras, the lights,
 * physics, `useRenderStyle`, `useFog`): what concerns the whole game is `useGame()`'s, and what lasts
 * goes in a store. `useScene` works in it for the scenes it names (`launch('Hud')`, `pause('Level')`),
 * and throws for what would be about a scene of its own: `change`, and the calls with no name. It
 * draws nothing: what it creates is not seen, so something always on screen (a score) is a scene
 * launched beside the levels; launched from its body or its `useReady`, before the game has a scene,
 * it comes on the first frame the game is shown, over the scene the game starts on, the splash
 * or not. Behind a splash its updates wait, as the scenes' do. One that throws, starting or in a
 * frame, is reported and the game goes on without it.
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
    starting.add(store);
    try {
        startEach(store);
    } finally {
        starting.delete(store);
    }
};

/**
 * The games whose systems are starting now, their bodies and their `useReady`: the only moment a
 * system's `launch` waits for the game to be shown (see `launchOnceShown`).
 */
const starting = new WeakSet<TRuntimeStore>();

/**
 * Whether `store`'s systems are starting now: their bodies or their `useReady` are running.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const systemsStarting = (store: TRuntimeStore): boolean => starting.has(store);

/**
 * Starts every registered system in `store`: see `startGameSystems`.
 */
const startEach = (store: TRuntimeStore): void => {
    running.add(store);
    const started: TBox[] = [];
    // The ones registered now: one a body registers waits for the next game, as it is told.
    for (const [name, fn] of [...registered]) {
        // One before it ended the game: none after it starts.
        if (store.get('loop').destroyed) {
            break;
        }
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
    // A body that ended the game (the page's `destroy`, from inside it): `destroy` found none of them
    // listed yet to take down, so they are taken down here, the last started first, their cleanups run.
    if (store.get('loop').destroyed) {
        running.delete(store);
        for (let i = started.length - 1; i >= 0; i--) {
            teardownBox(started[i]!);
        }
        return;
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
    // What they launched and is still waiting goes with them.
    waitingLaunches.delete(store);
};

/**
 * A launch a system asked for before the game had a scene: which system, which scene, and the
 * launch itself.
 */
type TWaitingLaunch = { readonly system: string; readonly scene: string; readonly launch: () => void };

/**
 * The scenes each game's systems launched before it had any scene to show, waiting to be launched.
 */
const waitingLaunches = new WeakMap<TRuntimeStore, TWaitingLaunch[]>();

/**
 * Keeps a launch a system asked for while the systems start, before the game has any scene (from
 * its body or its `useReady`), until the first frame the game is shown.
 *
 * Launched then rather than at once, because at once it would be the first scene, and the one the
 * game starts on would be drawn over it: a HUD launched by a system would sit under the level, and
 * a system launching the very scene the game starts on would make the game fail to start. Shown is
 * nothing held and no scene change being covered, the same behind a splash, which is not one of the
 * game's scenes.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const launchOnceShown = (store: TRuntimeStore, system: string, scene: string, launch: () => void): void => {
    let waiting = waitingLaunches.get(store);
    if (waiting === undefined) {
        waiting = [];
        waitingLaunches.set(store, waiting);
    }
    waiting.push({ system, scene, launch });
};

/**
 * Whether the game is shown: some scene of its own running (the splash is not one), none held behind
 * a cover, and no change being covered. Behind a splash too, so what a system launches lands where it
 * would without one.
 */
const shown = (store: TRuntimeStore): boolean => {
    const scenes = store.get('world').scenes;
    const splash = splashOf(store);
    if (!scenes.some((scene) => scene !== splash)) return false;
    return !scenes.some((scene) => scene.held) && store.get('transition').active === null;
};

/**
 * Whether a launch a system asked for before the game had a scene is about to be made, the game
 * being shown: the splash waits for it, as it may come covered. Not one waiting for a game that has
 * no scene of its own, which may never come, and the splash would wait for ever.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const launchesDue = (store: TRuntimeStore): boolean => (waitingLaunches.get(store)?.length ?? 0) > 0 && shown(store);

/**
 * Launches what the systems asked for before the game had a scene, once it is shown, in the order
 * they were asked, each on its own, so one that throws is said and the rest are launched. One that
 * comes in covered holds the rest until the screen is uncovered again, rather than having them
 * refused as a change asked for while another is covering.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const flushSystemLaunches = (store: TRuntimeStore): void => {
    const waiting = waitingLaunches.get(store);
    // Checked before each one: a scene launched may end the game from its `useReady`, or a tool
    // take the systems down, and what was still waiting goes with them.
    while (waiting !== undefined && waiting.length > 0 && !store.get('loop').destroyed && waitingLaunches.get(store) === waiting && shown(store)) {
        const { system, scene, launch } = waiting.shift()!;
        try {
            launch();
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            console.error(`[NacatamalOn] game system '${system}': scene '${scene}', which it launched before the game had a scene, threw while starting, and the game goes on without it. Fix what throws in its body or its useReady.`, failure);
            // What the editor and a headless run read to know something failed.
            if (store.get('loop').failure === null) {
                store.setState('loop', { failure });
            }
        }
    }
    if (waiting !== undefined && waiting.length === 0 && waitingLaunches.get(store) === waiting) {
        waitingLaunches.delete(store);
    }
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
    // Behind the splash the game waits, its systems with it.
    if (systems.length === 0 || gameBehindSplash(store)) {
        return null;
    }
    const late: TBox[][] = [];
    for (const system of systems) {
        // One before it ended the game from its update: none after it runs.
        if (store.get('loop').destroyed) {
            break;
        }
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
        // One before it ended the game from its late update: none after it runs.
        if (store.get('loop').destroyed) {
            break;
        }
        try {
            runLateUpdates(late[i]!, dt, systems[i]?.time ?? 0);
        } catch (error) {
            reportFrameError(store, error);
        }
    }
};

/**
 * The name of the game system `box` belongs to, or `undefined` for a box of a scene: what lets a
 * hook that works in both tell which one called it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const systemNameOf = (box: TBox): string | undefined => systemNames.get(rootOf(box));

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
    const name = systemNameOf(box);
    if (name !== undefined) {
        throw new Error(`[NacatamalOn] ${hook}: '${name}' is a game system, which belongs to no scene. Use useGame() for what concerns the whole game, or launch a scene of its own.`);
    }
};
