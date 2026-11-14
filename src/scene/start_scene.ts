import { newBox, teardownBox, trackBoxGame } from '../box';
import { markSceneStopped } from './stopped_scenes';
import type { TBox } from '../box';
import { withActiveBox, withActiveGame } from '../store';
import { flushReady } from './flush_ready';
import type { TRuntimeStore } from '../store';

/**
 * The name each root was started under. Not always the name it has: a scene built from a document
 * takes the one its document gives its root.
 */
const startedUnder = new WeakMap<TBox, string>();

/**
 * The name `root` was started under, which is the one to restart it by.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const startedAs = (root: TBox): string => startedUnder.get(root) ?? root.name;

/**
 * The props each root was started with: what a restart builds it with again when it is given none.
 */
const startedWithProps = new WeakMap<TBox, object>();

/**
 * The props `root` was started with, `{}` when it was given none or was not started by name.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const startedWith = (root: TBox): object => startedWithProps.get(root) ?? {};

/**
 * A scene started in the place of another, its old copy restarted or the scene a change replaces:
 * the one going away, and where the new one goes among the running scenes, the index it is put in
 * at.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneInPlace = {
    readonly old: TBox;
    readonly place: (scenes: readonly TBox[]) => number;
};

/**
 * Each root's place among the scenes, shared by every scene started in the place of another: what
 * lets a place kept by the scenes over one still find it once it has been replaced, and a scene
 * restarted inside another's body keep the place its own restart gave it.
 *
 * A token of its own and not a link from one scene to the next, so a scene that has stopped is
 * never kept alive by the one that took its place: a level restarted a hundred times holds one
 * empty object, not a hundred trees.
 */
const places = new WeakMap<TBox, object>();

/**
 * `scene`'s place, made the first time another scene is started in it.
 */
const placeOf = (scene: TBox): object => {
    let place = places.get(scene);
    if (place === undefined) {
        place = {};
        places.set(scene, place);
    }
    return place;
};

/**
 * Where among `now` the scene in `scene`'s place is: itself while it runs, even with a scene on its
 * way to take its place behind a cover; the one that took its place once it has gone. `-1` for none.
 */
const indexInPlaceOf = (now: readonly TBox[], scene: TBox): number => {
    const own = now.indexOf(scene);
    if (own >= 0) {
        return own;
    }
    const place = places.get(scene);
    return place === undefined ? -1 : now.findIndex((other) => places.get(other) === place);
};

/**
 * Whether `scene` is one of `before`, or one that took the place of one of them.
 */
const isOneOf = (scene: TBox, before: ReadonlySet<TBox>, beforePlaces: ReadonlySet<object>): boolean => {
    if (before.has(scene)) {
        return true;
    }
    const place = places.get(scene);
    return place !== undefined && beforePlaces.has(place);
};

/**
 * Starts a scene in `root`'s place: its old copy restarted, or the scene a change brings in for it.
 * The new one goes under the first of the scenes above `root` now that is still running then (or
 * the one that took its place), or on top when none is.
 *
 * Taken before `root` stops and read after, because its cleanups may stop other scenes and move
 * every place in the list: an index taken first would then point somewhere else, or past the end.
 * A root that is not running goes on top.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const inPlaceOf = (store: TRuntimeStore, root: TBox): TSceneInPlace => {
    const scenes = store.get('world').scenes;
    const at = scenes.indexOf(root);
    const above = at < 0 ? [] : scenes.slice(at + 1);
    return {
        old: root,
        place: (now) => {
            for (const scene of above) {
                const found = indexInPlaceOf(now, scene);
                if (found >= 0) {
                    return found;
                }
            }
            return now.length;
        },
    };
};

/**
 * A scene being built: its root, the scenes running when its body began, and, started in another's
 * place, where it goes. Several at once when a body starts another scene; the last is the innermost.
 */
type TBuilding = {
    readonly store: TRuntimeStore;
    readonly root: TBox;
    readonly before: ReadonlySet<TBox>;
    readonly inPlace: TSceneInPlace | undefined;
};

const building: TBuilding[] = [];

/**
 * The running scenes once `entry` is listed among `list`: on top, or, started in another's place, in
 * that place, with the scenes its body started just under it in the order they started, as they
 * would have been under it on top. The ones that were running when its body began, or the scenes
 * that took their places, keep their places.
 */
const arrange = (list: readonly TBox[], entry: TBuilding): TBox[] => {
    if (entry.inPlace === undefined) {
        return [...list, entry.root];
    }
    const beforePlaces = new Set<object>();
    for (const scene of entry.before) {
        const place = places.get(scene);
        if (place !== undefined) beforePlaces.add(place);
    }
    const kept = list.filter((scene) => isOneOf(scene, entry.before, beforePlaces));
    const started = list.filter((scene) => !isOneOf(scene, entry.before, beforePlaces));
    const at = Math.min(Math.max(entry.inPlace.place(kept), 0), kept.length);
    return [...kept.slice(0, at), ...started, entry.root, ...kept.slice(at)];
};

/**
 * The running scenes of `store` as they will be once every scene being built now is listed: what a
 * body asking for its style is laid by before it is. The same arrangement `startScene` makes, from
 * the innermost build out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const scenesOnceBuilt = (store: TRuntimeStore): readonly TBox[] => {
    let list: readonly TBox[] = store.get('world').scenes;
    for (let i = building.length - 1; i >= 0; i--) {
        if (building[i]!.store === store) {
            list = arrange(list, building[i]!);
        }
    }
    return list;
};

/**
 * Whether `root` is a scene whose body is running now, not yet listed among the running scenes.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isBeingBuilt = (root: TBox): boolean => building.some((entry) => entry.root === root);

/**
 * Whether a scene started under `name` has its body running now in `store`, not yet listed.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isNameBeingBuilt = (store: TRuntimeStore, name: string): boolean =>
    building.some((entry) => entry.store === store && startedAs(entry.root) === name);

/**
 * Another running scene than `except` answering to `name`, by either of its names: the one that
 * would make `startScene` refuse to start `name` again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const nameTakenBy = (store: TRuntimeStore, name: string, except: TBox): TBox | undefined =>
    store.get('world').scenes.find((other) => other !== except && (other.name === name || startedAs(other) === name));

/**
 * Turns a registered scene into a running one: creates its root box, runs the body with that
 * root active so every hook lands on it, attaches the children the body returns, and adds the
 * root to `world.scenes`. Returns the root.
 *
 * Synchronous from end to end. If the body throws, nothing is left behind: the root is never
 * added, and both active pointers are back where they were.
 *
 * Only registered scenes can be roots, and only one root per name runs at a time, so a name
 * always means one scene. `props` is what the body is called with, `{}` when nobody gave any.
 *
 * Added on top of the scenes running, unless it is started in another's place (`inPlaceOf`), asked
 * for once the body has run: a scene restarted takes the place of its old copy, and the one a change
 * brings in the place of the scene it replaces, so the next level stays under the HUD launched over
 * the first. The scenes its body started go with it, just under it and in the order they started,
 * as they would have been under it on top.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const startScene = (store: TRuntimeStore, name: string, props: object = {}, inPlace?: TSceneInPlace): TBox => {
    const { names, scenes } = store.get('world');

    const body = names.get(name);
    if (body === undefined) {
        // A scene file is only known by its name once it lands, so any still on its way may be it.
        const arriving = [...store.get('assets').scenes.values()].filter((scene) => scene.status === 'loading' && scene.name === '').map((scene) => scene.src);
        throw new Error(arriving.length > 0
            ? `[NacatamalOn] scenes: '${name}' is not registered yet, and ${arriving.join(', ')} ${arriving.length === 1 ? 'is' : 'are'} still loading. Wait for useLoadScene with useLoadProgress before changing to it.`
            : `[NacatamalOn] scenes: '${name}' is not registered. Add it to the object passed to createGame, or load its .scene file with useLoadScene.`);
    }
    // By either name: a scene built from a document answers to the one its document gave it, and
    // is still the scene started under this one.
    if (scenes.some((scene) => scene.name === name || startedAs(scene) === name)) {
        throw new Error(`[NacatamalOn] scenes: '${name}' is already running. Stop it first, or change to it from the scene that is running.`);
    }
    // Nor while its body is running: a body launching its own name, or two scenes each making sure
    // of the other, would start it twice, or for ever.
    if (isNameBeingBuilt(store, name)) {
        throw new Error(`[NacatamalOn] scenes: '${name}' is being started right now (its body is running), so it cannot start again. Launch it from one place only, or ask isRunning first.`);
    }

    const root = newBox(name);
    startedUnder.set(root, name);
    // A copy of its own, so a body that changes what it was handed does not change what a restart
    // builds it with.
    startedWithProps.set(root, { ...props });
    trackBoxGame(root, store);
    if (inPlace !== undefined) {
        // The old one's place is this one's too, from before its body runs: a scene being built
        // around it (a restart of the level whose body restarts the HUD) has to see it as the one
        // in that place while it measures the screen, not as one its body launched.
        places.set(root, placeOf(inPlace.old));
    }
    const entry: TBuilding = { store, root, before: new Set(scenes), inPlace };
    building.push(entry);
    let result: ReturnType<typeof body>;
    try {
        result = withActiveGame(store, () => withActiveBox(store, root, () => body(props)));
    } finally {
        building.splice(building.lastIndexOf(entry), 1);
    }

    // TypeScript already rejects both of these. They are here for plain JavaScript.
    if (typeof (result as { then?: unknown } | undefined)?.then === 'function') {
        throw new Error(`[NacatamalOn] scenes: '${name}' returned a promise. A scene's function cannot be async: load what it needs with the useLoad… hooks, which return at once.`);
    }
    if (result === undefined || !Array.isArray(result.children)) {
        throw new Error(`[NacatamalOn] scenes: '${name}' must end with \`return createScene()\`.`);
    }

    for (const child of result.children) {
        // Created inside the body, or listed twice: already attached here.
        if (child.parent === root) continue;
        if (child.parent !== null) {
            throw new Error(`[NacatamalOn] scenes: '${child.name}' already belongs to '${child.parent.name}'.`);
        }
        child.parent = root;
        root.children.push(child);
    }

    // Read again rather than reusing `scenes` from the top: the body may have started another
    // scene, and appending to the old array would drop it.
    // The game ended while its body ran (something in it, or in a cleanup it set off, ended it):
    // taken down rather than listed in a game nobody will tear down again, so its cleanups run.
    if (store.get('loop').destroyed) {
        markSceneStopped(root);
        teardownBox(root);
        return root;
    }
    store.setState('world', { scenes: arrange(store.get('world').scenes, entry) });
    // Whole now, children attached and listed: what `useReady` waited for. Unless this start is
    // itself part of a build (a body launching another scene), whose end runs them all.
    if (store.get('world').boxStack.length === 0) flushReady(store);
    return root;
};
