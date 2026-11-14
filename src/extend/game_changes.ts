import type { TRuntimeStore } from '../store';
import type { TTexture } from '../loaders/texture/types/t_texture';
import type { TGeometry } from '../geometry/types/t_geometry';
import { splashOf } from '../splash/behind_splash';
import { geometryRoom } from '../geometry/create_geometry';
import { askedBeforeCount } from '../loaders/asked_by';

/**
 * A number for each object a check has seen: a root, a list, a file. Given in the order first seen,
 * so something new always has a higher one than anything already there. Held weakly: being
 * numbered keeps nothing alive, which is why what was seen is written down in numbers and never as
 * the objects themselves.
 */
const ids = new WeakMap<object, number>();
let lastId = 0;

const idOf = (thing: object): number => {
    let id = ids.get(thing);
    if (id === undefined) {
        id = ++lastId;
        ids.set(thing, id);
    }
    return id;
};

/**
 * How many of the files `root` asked for are ready, and of how many.
 */
const loadsOf = (root: { readonly loads: readonly { readonly status: string }[] }): string => {
    let ready = 0;
    for (const asset of root.loads) {
        if (asset.status === 'ready') ready++;
    }
    return `${ready}/${root.loads.length}`;
};

/**
 * The game's scenes as last checked: the lists the world swaps for new ones on every change, each
 * root's pause and hold, which are written onto the root, and how far each has got with its files,
 * all of which `inspectGame` tells in its scenes and systems. Not the splash, which is not one of the
 * game's scenes.
 */
const scenesNow = (store: TRuntimeStore): string => {
    const world = store.get('world');
    const splash = splashOf(store);
    let seen = `${idOf(world.names)}/`;
    for (const root of world.scenes) {
        if (root !== splash) {
            seen += `${idOf(root)}${root.paused ? 'p' : ''}${root.held ? 'h' : ''}:${loadsOf(root)},`;
        }
    }
    seen += '/';
    for (const root of world.systems) {
        seen += `${idOf(root)}:${loadsOf(root)},`;
    }
    return seen;
};

/** How a file's state is written in what was seen. */
const STATE: Readonly<Record<string, string>> = { loading: 'l', ready: 'r', error: 'e', released: 'x' };

/**
 * The game's files as last checked, each one written down: which it is, how it is, and, for a
 * picture (a sheet's or a font's own included, which a font grows as it meets new letters) its
 * size, for a shape the room it takes on the card. Then each running scene and system that asked
 * for some, with how many of them are ready, which also covers what it asked for that no cache
 * keeps; and how many times a stopped one was said to have asked for something.
 *
 * Written whole rather than summed: two changes in one frame can never cancel out. It is only
 * built while something listens.
 */
const assetsNow = (store: TRuntimeStore): string => {
    let seen = '';
    for (const cache of Object.values(store.get('assets')) as Map<string, { status?: string }>[]) {
        seen += '#';
        for (const asset of cache.values()) {
            seen += `${idOf(asset)}${STATE[asset.status ?? ''] ?? '?'}`;
            const type = (asset as { type?: string }).type;
            const picture = type === 'texture'
                ? asset as TTexture
                : (asset as { texture?: TTexture | null }).texture ?? null;
            if (picture !== null && typeof picture === 'object') {
                seen += `${picture.width}x${picture.height}`;
            }
            if (type === 'geometry') {
                const room = geometryRoom(asset as TGeometry);
                seen += `${room.corners}/${room.indices}`;
            }
            seen += ',';
        }
    }
    const world = store.get('world');
    const splash = splashOf(store);
    for (const root of [...world.scenes, ...world.systems]) {
        // One that asked for nothing names no file, whether it runs or not.
        if (root === splash || root.loads.length === 0) {
            continue;
        }
        seen += `|${idOf(root)}:${loadsOf(root)}`;
    }
    return `${seen}|${askedBeforeCount(store)}`;
};

type TWatchHalf = { readonly listeners: Set<() => void>; seen: string | null };
type TWatch = { readonly scenes: TWatchHalf; readonly assets: TWatchHalf };

/** Who listens to each game. A game nobody listens to has no entry, and pays one lookup a frame. */
const watches = new WeakMap<TRuntimeStore, TWatch>();

const watchOf = (store: TRuntimeStore): TWatch => {
    let watch = watches.get(store);
    if (watch === undefined) {
        watch = { scenes: { listeners: new Set(), seen: null }, assets: { listeners: new Set(), seen: null } };
        watches.set(store, watch);
    }
    return watch;
};

/**
 * Calls each listener, every one of them even when one throws.
 */
const tell = (store: TRuntimeStore, listeners: Set<() => void>, what: string): void => {
    // A copy: a listener may stop listening, or add another, while they are told. One taken off by
    // an earlier one is not told; one added is told from the next change.
    for (const listener of [...listeners]) {
        if (!listeners.has(listener)) {
            continue;
        }
        // One of them ended the game: the rest are told nothing.
        if (store.get('loop').destroyed) {
            return;
        }
        try {
            listener();
        } catch (error) {
            console.error(`[NacatamalOn] ${what}: a listener threw. The others were still told.`, error);
        }
    }
};

/**
 * Tells those listening to `store` what changed since the last check: once for its scenes, once for
 * its files, at most, however many things changed. Called once at the end of each frame, paused or
 * not.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const tellGameChanges = (store: TRuntimeStore): void => {
    const watch = watches.get(store);
    // Ended while it was drawn, by something drawing.
    if (watch === undefined || store.get('loop').destroyed) {
        return;
    }
    if (watch.scenes.listeners.size > 0) {
        const now = scenesNow(store);
        if (watch.scenes.seen !== now) {
            watch.scenes.seen = now;
            tell(store, watch.scenes.listeners, 'onScenesChanged');
        }
    }
    // A listener told of its scenes may have ended the game.
    if (store.get('loop').destroyed) {
        return;
    }
    if (watch.assets.listeners.size > 0) {
        const now = assetsNow(store);
        if (watch.assets.seen !== now) {
            watch.assets.seen = now;
            tell(store, watch.assets.listeners, 'onAssetsChanged');
        }
    }
};

/**
 * Calls `listener` once at the end of each frame in which the game's scenes changed: one started,
 * stopped, paused, resumed, was held behind a transition or uncovered, was registered, or saw one of
 * the files it asked for arrive, or a system started, stopped or saw one of its files arrive.
 * However many changed in that frame, it is called once.
 *
 * It is told while the game is paused too, since frames go on being drawn, and is told nothing
 * once the game has ended. It hands nothing over: `inspectGame` says what the scenes are now.
 *
 * For a tool that watches a game, so it need not ask every frame. What counts as a change only
 * grows until 2.0.
 *
 * @example
 * ```ts
 * import { registerGameSystem, useCleanup } from 'nacatamalon';
 * import { getActiveGame, inspectGame, onScenesChanged } from 'nacatamalon/extend';
 *
 * export const installSceneLog = () => registerGameSystem('my-plugin-scene-log', () => {
 *     const store = getActiveGame()!;
 *     const stop = onScenesChanged(store, () => {
 *         console.log(inspectGame(store).scenes.map((scene) => `${scene.name}: ${scene.state}`));
 *     });
 *     useCleanup(stop);
 * });
 * ```
 *
 * @param store - The game, as `getActiveGame()` hands it.
 * @param listener - What to call. One that throws is said, and the others are still called.
 * @returns How to stop listening.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const onScenesChanged = (store: TRuntimeStore, listener: () => void): (() => void) => {
    const watch = watchOf(store).scenes;
    // Seen as they are now, so the first call is for a change after this one.
    if (watch.listeners.size === 0) {
        watch.seen = scenesNow(store);
    }
    watch.listeners.add(listener);
    return () => {
        watch.listeners.delete(listener);
    };
};

/**
 * Calls `listener` once at the end of each frame in which the game's files changed: one was asked
 * for, arrived, failed, was let go of, was put in another's place or changed size (a picture, or a
 * shape `updateGeometry` gave more room on the card), or a scene or system that asked for some
 * started or stopped, or saw one of them arrive, or one that stopped was found to have asked for one. However many changed in
 * that frame, it is called once. Who keeps a file (`heldBy`) is read when `inspectGame` is called,
 * and a change in it alone is not told.
 *
 * It is told while the game is paused too, since frames go on being drawn, and is told nothing
 * once the game has ended. It hands nothing over: `inspectGame` says what the files are now.
 *
 * For a tool that watches a game, so it need not ask every frame. While something listens, each
 * frame looks over every file the game keeps, which a game that ships with no such tool never
 * pays. What counts as a change only grows until 2.0.
 *
 * @example
 * ```ts
 * import { registerGameSystem, useCleanup } from 'nacatamalon';
 * import { getActiveGame, inspectGame, onAssetsChanged } from 'nacatamalon/extend';
 *
 * export const installMemoryLog = () => registerGameSystem('my-plugin-memory-log', () => {
 *     const store = getActiveGame()!;
 *     useCleanup(onAssetsChanged(store, () => {
 *         const { assets } = inspectGame(store);
 *         const bytes = assets.reduce((total, asset) => total + (asset.bytes ?? 0), 0);
 *         console.log(`${assets.length} files, about ${Math.round(bytes / 1024)} KB`);
 *     }));
 * });
 * ```
 *
 * @param store - The game, as `getActiveGame()` hands it.
 * @param listener - What to call. One that throws is said, and the others are still called.
 * @returns How to stop listening.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const onAssetsChanged = (store: TRuntimeStore, listener: () => void): (() => void) => {
    const watch = watchOf(store).assets;
    if (watch.listeners.size === 0) {
        watch.seen = assetsNow(store);
    }
    watch.listeners.add(listener);
    return () => {
        watch.listeners.delete(listener);
    };
};
