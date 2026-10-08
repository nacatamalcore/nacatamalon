import { createActions, createGamepads, createInputMap, createKeyboard, createPointer } from '../input';
import { createRandom } from '../math/random';
import { nanoId } from '../utils';
import type { TRuntimeSectionName, TRuntimeState } from './types/t_runtime_state';
import type { TRuntimeStore, TRuntimeStoreInit } from './types/t_runtime_store';

/**
 * Builds the source of truth for one running game.
 *
 * Called once, by `createGame`, the moment the renderer answers. That is why it takes the
 * canvas and the renderer instead of making them: everything here is already resolved, and
 * the store's job is to hold it and to tell people when it changes.
 *
 * Every piece of state lives in this closure, so calling it twice gives two games that share
 * nothing. See {@link TRuntimeStore} for the read/write contract.
 *
 * @example
 * Built once, in `createGame`, after the renderer resolves:
 * ```ts
 * const store = createRuntimeStore({
 *     canvas: screen.canvas,
 *     renderer: rendererInstance,
 *     config: cleanedOptions,
 * });
 * ```
 *
 * @example
 * Reading. `get` takes one section and returns it as it is right now:
 * ```ts
 * const { width, background } = store.get('config');
 * const { canvas } = store.get('screen');
 * ```
 *
 * @example
 * Writing. A patch merges into the section, and only the fields that really changed
 * wake anyone:
 * ```ts
 * store.setState('config', { background: getColor('red') });
 * store.setState('config', { width: 640, height: 480 });  // one notification, not two
 * ```
 *
 * @example
 * Listening to a whole section, and stopping. The listener runs on any change to the section,
 * with all of it: here a page element follows the game's background, whoever changed it.
 * ```ts
 * const stop = store.subscribe('config', (config) => {
 *     const { r, g, b } = config.background;
 *     frame.style.borderColor = `rgb(${r * 255} ${g * 255} ${b * 255})`;
 * });
 * stop();
 * ```
 *
 * @example
 * Listening to one thing inside a section. The listener only runs when what the selector
 * picks changes, and it receives the new value and the old one:
 * ```ts
 * store.subscribe('config', (c) => c.width, (width, previous) => {
 *     console.log(`width ${previous} -> ${width}`);
 * });
 * ```
 *
 * @example
 * The counters, for a host that cannot be pushed to. `version` is a number, so React's
 * `useSyncExternalStore` can compare it; the section itself holds a `GPUDevice` and cannot:
 * ```ts
 * useSyncExternalStore(
 *     (cb) => store.subscribe('config', cb),
 *     () => store.version('config'),
 * );
 * ```
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createRuntimeStore = (init: TRuntimeStoreInit): TRuntimeStore => {
    // Built before the state so the actions can be given them.
    const keyboard = createKeyboard(init.canvas);
    const gamepads = createGamepads(init.canvas);
    // The actions take their pads from the game's own, never around them: a port is only asked about
    // once somebody holds a handle for it.
    const actions = createActions({
        keyboard,
        gamepad: (index) => gamepads.handle(index),
        actions: init.config.actions,
    });

    const state: TRuntimeState = {
        screen: { canvas: init.canvas, renderer: init.renderer, fullscreen: init.fullscreen ?? null },
        config: init.config,
        world: { scenes: [], boxStack: [], names: new Map(), pendingDestroy: [], buildScripts: 'run' },
        loop: { destroyed: false, pausedBy: [], timeScale: 1, failure: null, step: null },
        input: {
            keyboard: keyboard,
            pointer: createPointer(init.canvas),
            gamepads: gamepads,
            // The actions take their pads from the game's own, never around them: a port is only
            // asked about once somebody holds a handle for it.
            actions,
            inputMap: createInputMap(actions, init.config.actionsPersist ?? null),
        },
        random: { rng: createRandom(init.config.seed) },
        assets: { textures: new Map(), atlases: new Map(), fonts: new Map(), sounds: new Map(), tilemaps: new Map(), geometries: new Map(), gltf: new Map(), shaders: new Map(), particles: new Map(), palettes: new Map(), luts: new Map(), packs: new Map(), pixels: new Map() },
        // Empty, and empty has to stay free: with no effects the frame is drawn exactly as it was
        // before any of this existed. See `TRuntimeState.post`.
        post: { effects: [], enabled: true },
        // Nothing is being covered, which is the state a game is in for all but a few frames of its
        // life. See `TRuntimeState.transition`.
        transition: { active: null },
        // Opened by the first sound, never before: see `TRuntimeState.audio`.
        audio: { manager: null },
        // Measured by the loop from its second frame on: see `TRuntimeState.stats`.
        stats: { fps: 0 },
        // Each scene's own cameras until a tool says otherwise: see `TRuntimeState.viewport`.
        viewport: { camera3d: null, camera2d: null, layers: null, preview: null },
        // Nobody has asked for a picture: see `TRuntimeState.capture`.
        capture: { request: null },
    };

    // Add more keys sections when
    const versions: Record<TRuntimeSectionName, number> = {
        screen: 0,
        config: 0,
        world: 0,
        loop: 0,
        input: 0,
        random: 0,
        assets: 0,
        audio: 0,
        post: 0,
        transition: 0,
        stats: 0,
        viewport: 0,
        capture: 0,
    };

    /**
     * One `Set` per section, created on first subscribe. A game nobody listens to allocates
     * nothing, and a `setState` on a section with no listeners costs one `Map.get`.
     */
    const listeners = new Map<TRuntimeSectionName, Set<(value: never) => void>>();

    const get = <K extends TRuntimeSectionName>(section: K): Readonly<TRuntimeState[K]> => state[section];

    const getState = (): Readonly<TRuntimeState> => state;

    const version = (section: TRuntimeSectionName): number => versions[section];

    const setState = <K extends TRuntimeSectionName>(section: K, patch: Partial<TRuntimeState[K]>): void => {
        const current = state[section];

        let changed = false;
        for (const key in patch) {
            if (!Object.is(current[key], patch[key])) {
                changed = true;
                break;
            }
        }
        if (!changed) return;

        // The generic key defeats the checker here: it cannot prove `state[K]` accepts a
        // spread of `TRuntimeState[K]`, but the two sides are the same `K` by construction.
        (state as Record<string, unknown>)[section] = { ...current, ...patch };
        versions[section] += 1;

        const subscribers = listeners.get(section);
        if (subscribers === undefined) return;
        // Snapshot before dispatch: a listener may unsubscribe itself while we iterate
        // (`useSyncExternalStore` does exactly that on unmount), and mutating the live Set
        // mid-loop is undefined behaviour.
        for (const notify of [...subscribers]) (notify as (value: TRuntimeState[K]) => void)(state[section]);
    };

    /**
     * Define overloads, so that the `subscribe` function can be called either with a simple listener
     * @example 
     * ```ts
     * const unsubscribe = subscribe('screen', (screen) => {
     *     console.log(screen);
     * });
     * // Later, to unsubscribe:
     * unsubscribe();
     * ```
     */
    function subscribe<K extends TRuntimeSectionName>(
        section: K,
        listener: (value: Readonly<TRuntimeState[K]>) => void,
    ): () => void;
    function subscribe<K extends TRuntimeSectionName, S>(
        section: K,
        selector: (value: Readonly<TRuntimeState[K]>) => S,
        listener: (value: S, previous: S) => void,
    ): () => void;
    function subscribe(
        section: TRuntimeSectionName,
        second: (value: never) => unknown,
        third?: (value: never, previous: never) => void,
    ): () => void {
        const existing = listeners.get(section);
        const subscribers = existing ?? new Set<(value: never) => void>();
        if (existing === undefined) listeners.set(section, subscribers);

        // What goes into the Set is always a wrapper, never the caller's own function: the
        // selector form needs somewhere to keep the last selected value, and subscribing the
        // same listener twice has to mean two subscriptions.
        let wrapped: (value: never) => void;

        if (third === undefined) {
            // Wrapped even here, where there is nothing to wrap: putting the caller's own
            // function in the Set makes two subscriptions of the same listener collapse into
            // one, and then a single unsubscribe silently kills both.
            const listener = second as (value: never) => void;
            wrapped = (value: never) => listener(value);
        } else {
            let previous = second(state[section] as never);
            wrapped = ((value: never) => {
                const next = second(value);
                if (Object.is(next, previous)) return;
                const before = previous;
                // Written before the call, so a listener that reads the store sees the same
                // baseline it would on the next notification.
                previous = next;
                third(next as never, before as never);
            }) as (value: never) => void;
        }

        subscribers.add(wrapped);

        return () => {
            subscribers.delete(wrapped);
        };
    }

    const destroy = (): void => {
        listeners.clear();
    };

    return { id: nanoId(), get, getState, setState, subscribe, version, destroy };
};
