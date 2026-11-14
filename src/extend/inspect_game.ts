import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';
import type { TLoadStatus } from '../loaders/types/t_load_status';
import type { TTexture } from '../loaders/texture/types/t_texture';
import type { TAudioClip } from '../loaders/audio/types/t_audio_clip';
import type { TGeometry } from '../geometry/types/t_geometry';
import type { TPluginAsset } from '../loaders/plugin/types';
import { COLOR_STRIDE, DETAIL_STRIDE, GEOMETRY_STRIDE, SKIN_STRIDE } from '../geometry/types/t_geometry';
import { GAME, countingHoldersOf } from '../loaders/asset_holds';
import { askedBeforeBy } from '../loaders/asked_by';
import { isMipmapped } from '../loaders/texture/mipmapped_texture';
import { SPLASH_SCENE, splashOf } from '../splash/behind_splash';
import { startedAs } from '../scene/start_scene';
import { geometryRoom } from '../geometry/create_geometry';

/**
 * How far a scene or a system has got with what it asked for: how many of its files are ready, of
 * all it asked for.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLoadsInspection = {
    readonly ready: number;
    readonly total: number;
};

/**
 * A scene of the game, as `inspectGame` saw it.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneInspection = {
    /**
     * The name it is registered and launched by, or, for one with `registered: false`, the one it was
     * started under.
     */
    readonly name: string;
    /**
     * - `'running'`: updated and drawn. A scene behind the splash is running too: it was built, and
     *   the scenes it asked for were started, as without a splash, but it is not updated or drawn
     *   until the splash lets the game go.
     * - `'paused'`: drawn, but not updated (`useScene().pause`).
     * - `'held'`: started, but waiting behind a transition to be uncovered.
     * - `'stopped'`: registered, and not running.
     */
    readonly state: 'running' | 'paused' | 'held' | 'stopped';
    /** Whether it is registered, so `launch` can start it by its name. */
    readonly registered: boolean;
    /** What its body asked for, while it runs. `0` of `0` once stopped. */
    readonly loads: TLoadsInspection;
};

/**
 * A game system (`registerGameSystem`), as `inspectGame` saw it.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSystemInspection = {
    readonly name: string;
    /** What its body asked for. */
    readonly loads: TLoadsInspection;
};

/**
 * Who keeps a file loaded, as `inspectGame` tells it:
 *
 * - `'game'`: the game asked for it with a loader (`useLoadTexture` and the rest), and keeps it
 *   until `releaseAsset`, whoever asked.
 * - `'asset'`: another file wears it or reads it: a model its picture, a map its sheet.
 * - `'unnamed'`: something with no name of its own, made in code: an effect written in code, a map
 *   built from a document.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THolderInspection =
    | { readonly kind: 'game' }
    | { readonly kind: 'asset'; readonly type: string; readonly key: string }
    | { readonly kind: 'unnamed' };

/**
 * A file the game has loaded, or is loading, as `inspectGame` saw it.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAssetInspection = {
    /**
     * What kind of file it is: `'texture'`, `'atlas'`, `'bitmapFont'`, `'font'`, `'audio'`,
     * `'tilemap'`, `'geometry'`, `'model'`, `'shader'`, `'particles'`, `'song'`, `'motion'`,
     * `'palette'`, `'lut'`, `'pack'`, `'scene'` or `'pixels'`, or the `kind` of a plugin's own
     * (`registerAssetType`). More may come.
     */
    readonly type: string;
    /** What it is kept under: what `releaseAsset` and a `key` option name. */
    readonly key: string;
    readonly status: Exclude<TLoadStatus, 'released'>;
    /**
     * What can be told of it: a picture's size (a sheet's or a font's too: the picture it wears), a
     * sound's length. Empty for the rest.
     */
    readonly detail: { readonly width?: number; readonly height?: number; readonly duration?: number };
    /**
     * Roughly how many bytes it takes once loaded: a picture on the graphics card (a sheet's or a
     * font's, the picture it wears, unless that is a file of its own, counted there), a sound decoded,
     * a shape's buffers (the room they have, which a shape that shrank keeps). `null` for what is not counted, or not loaded yet.
     */
    readonly bytes: number | null;
    /**
     * The scenes and systems that asked for it, by name, those that stopped since included, and
     * those that failed to start (their body threw, or what it handed back was refused): what tells
     * a file someone forgot to let go of.
     */
    readonly askedBy: readonly string[];
    /** Who keeps it loaded now. Empty when nothing has said it keeps it. */
    readonly heldBy: readonly THolderInspection[];
};

/**
 * What `inspectGame` saw: the game's scenes, its systems and its files, at that moment.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameInspection = {
    readonly scenes: readonly TSceneInspection[];
    readonly systems: readonly TSystemInspection[];
    /**
     * Every file the game keeps, the engine's own among them (the default font, the splash's mark).
     * A sung voice (`useLoadVocal`) is counted in the `loads` of the scene that asked for it, but is
     * not listed here.
     */
    readonly assets: readonly TAssetInspection[];
};

/**
 * What each of the game's caches holds, by the name a tool reads.
 */
const TYPES: Readonly<Record<string, string>> = {
    textures: 'texture',
    atlases: 'atlas',
    bitmapFonts: 'bitmapFont',
    fonts: 'font',
    sounds: 'audio',
    tilemaps: 'tilemap',
    geometries: 'geometry',
    gltf: 'model',
    shaders: 'shader',
    particles: 'particles',
    songs: 'song',
    motions: 'motion',
    palettes: 'palette',
    luts: 'lut',
    packs: 'pack',
    scenes: 'scene',
    pixels: 'pixels',
};

/** How many bytes a number of a shape's corners takes. */
const FLOAT = 4;

const loadsOf = (root: TBox): TLoadsInspection => Object.freeze({
    ready: root.loads.filter((asset) => asset.status === 'ready').length,
    total: root.loads.length,
});

const STOPPED: TLoadsInspection = Object.freeze({ ready: 0, total: 0 });

const stateOf = (root: TBox): TSceneInspection['state'] => {
    if (root.held) {
        return 'held';
    }
    return root.paused ? 'paused' : 'running';
};

/** The kinds of file that wear a picture of their own, kept inside them rather than on its own. */
const WEARS_PICTURE = new Set(['atlas', 'bitmapFont', 'font']);

/**
 * Roughly how many bytes a picture takes on the graphics card, or `null` before it is there.
 */
const pictureBytes = (texture: TTexture): number | null => {
    if (texture.status !== 'ready' || texture.width === 0 || texture.height === 0) {
        return null;
    }
    const bytes = texture.width * texture.height * 4;
    // A chain of smaller copies, each a quarter of the last, adds a third.
    return isMipmapped(texture) ? Math.round(bytes * 4 / 3) : bytes;
};

/**
 * Roughly how many bytes `asset` takes once loaded, or `null`, by what the engine knows it to be
 * (`kind`). `listed` is everything the caches keep, so a picture that is a file of its own is
 * counted there and not again in what wears it.
 */
const bytesOf = (type: string, asset: object, listed: ReadonlyMap<object, unknown>): number | null => {
    if (type === 'texture') {
        return pictureBytes(asset as TTexture);
    }
    if (WEARS_PICTURE.has(type)) {
        const picture = (asset as { texture?: TTexture | null }).texture ?? null;
        if (picture === null) {
            return null;
        }
        return listed.has(picture) ? 0 : pictureBytes(picture);
    }
    if (type === 'audio') {
        const buffer = (asset as TAudioClip).buffer;
        return buffer === null ? null : buffer.length * buffer.numberOfChannels * FLOAT;
    }
    if (type === 'geometry') {
        const shape = asset as TGeometry;
        if (shape.vertexBuffer === null) {
            return null;
        }
        // The room it has on the card, which a shape that shrank keeps.
        const { corners, indices } = geometryRoom(shape);
        return corners * GEOMETRY_STRIDE * FLOAT
            + (shape.indexBuffer === null ? 0 : indices * (shape.indexType === 'uint16' ? 2 : 4))
            + (shape.skinBuffer === null ? 0 : corners * SKIN_STRIDE * FLOAT)
            + (shape.colorBuffer === null ? 0 : corners * COLOR_STRIDE)
            + (shape.detailBuffer === null ? 0 : corners * DETAIL_STRIDE * FLOAT);
    }
    return null;
};

const detailOf = (type: string, asset: object): TAssetInspection['detail'] => {
    if (type === 'texture') {
        const { width, height } = asset as TTexture;
        return Object.freeze({ width, height });
    }
    if (WEARS_PICTURE.has(type)) {
        const picture = (asset as { texture?: TTexture | null }).texture ?? null;
        return Object.freeze(picture === null ? {} : { width: picture.width, height: picture.height });
    }
    if (type === 'audio') {
        return Object.freeze({ duration: (asset as TAudioClip).duration });
    }
    return Object.freeze({});
};

/**
 * Looks at a running game and says what is in it: its scenes, registered or running, with their
 * state; its systems; and every file it has loaded or is loading, with who asked for it and who
 * keeps it loaded.
 *
 * What it hands back is a picture of that moment, frozen: the game going on does not change it, and
 * each call makes a new one. Call it again when `onScenesChanged` or `onAssetsChanged` says
 * something changed.
 *
 * For a tool that watches a game (a panel listing its scenes and files, a check for files nobody let
 * go of), rather than for the game itself, which knows what it loaded. What it hands back only
 * gains fields and values until 2.0: none is taken away or changes meaning.
 *
 * @example
 * ```ts
 * import { registerGameSystem, useCleanup } from 'nacatamalon';
 * import { getActiveGame, inspectGame, onAssetsChanged } from 'nacatamalon/extend';
 *
 * // Says each file the game still keeps that no running scene or system asked for: one forgotten.
 * export const installLeakCheck = () => registerGameSystem('my-plugin-leak-check', () => {
 *     const store = getActiveGame()!;
 *     useCleanup(onAssetsChanged(store, () => {
 *         const { scenes, systems, assets } = inspectGame(store);
 *         const running = new Set([
 *             ...scenes.filter((scene) => scene.state !== 'stopped').map((scene) => scene.name),
 *             ...systems.map((system) => system.name),
 *         ]);
 *         for (const asset of assets) {
 *             const kept = asset.heldBy.some((holder) => holder.kind === 'game');
 *             if (kept && asset.askedBy.length > 0 && !asset.askedBy.some((name) => running.has(name))) {
 *                 console.warn(`'${asset.key}' is still loaded; asked for by ${asset.askedBy.join(', ')}`);
 *             }
 *         }
 *     }));
 * });
 * ```
 *
 * @param store - The game, as `getActiveGame()` hands it.
 * @returns The game's scenes, systems and files, as they are now.
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const inspectGame = (store: TRuntimeStore): TGameInspection => {
    const world = store.get('world');
    const splash = splashOf(store);
    const running = world.scenes.filter((scene) => scene !== splash);

    // Every registered scene, in the order registered, then any running that was started without a
    // name being registered.
    const scenes: TSceneInspection[] = [];
    const listed = new Set<TBox>();
    for (const name of world.names.keys()) {
        // The splash is the engine's, not one of the game's scenes, while it shows and after.
        if (name === SPLASH_SCENE) {
            continue;
        }
        const root = running.find((scene) => startedAs(scene) === name);
        if (root !== undefined) {
            listed.add(root);
        }
        scenes.push(Object.freeze({
            name,
            state: root === undefined ? 'stopped' : stateOf(root),
            registered: true,
            loads: root === undefined ? STOPPED : loadsOf(root),
        }));
    }
    for (const root of running) {
        if (!listed.has(root)) {
            scenes.push(Object.freeze({ name: startedAs(root), state: stateOf(root), registered: false, loads: loadsOf(root) }));
        }
    }

    const systems = world.systems.map((root) => Object.freeze({ name: root.name, loads: loadsOf(root) }));

    // Who asks for what, among what is still running.
    const askingNow = new Map<object, string[]>();
    for (const [root, name] of [
        ...running.map((scene) => [scene, startedAs(scene)] as const),
        ...world.systems.map((system) => [system, system.name] as const),
    ]) {
        for (const asset of root.loads) {
            const names = askingNow.get(asset);
            if (names === undefined) {
                askingNow.set(asset, [name]);
            } else if (!names.includes(name)) {
                names.push(name);
            }
        }
    }

    // Each file once, under the first name it is kept by, with what it is.
    // `type` is what a tool is told; `kind` what the engine knows it to be, which a plugin's own
    // kind of file may happen to share a name with, and which says how it is measured.
    const found = new Map<object, { type: string; kind: string; key: string }>();
    for (const [cache, held] of Object.entries(store.get('assets')) as [string, Map<string, object>][]) {
        for (const [key, asset] of held) {
            if (found.has(asset)) {
                continue;
            }
            const kind = cache === 'pluginAssets' ? 'plugin' : (TYPES[cache] ?? cache);
            const type = cache === 'pluginAssets' ? (asset as TPluginAsset).kind : kind;
            found.set(asset, { type, kind, key });
        }
    }

    const assets: TAssetInspection[] = [];
    for (const [asset, { type, kind, key }] of found) {
        const status = (asset as { status: TLoadStatus }).status;
        if (status === 'released') {
            continue;
        }
        const askedBy = [...askedBeforeBy(store, asset)];
        for (const name of askingNow.get(asset) ?? []) {
            if (!askedBy.includes(name)) {
                askedBy.push(name);
            }
        }
        const heldBy = countingHoldersOf(asset).map((holder): THolderInspection => {
            if (holder === GAME) {
                return Object.freeze({ kind: 'game' });
            }
            const named = found.get(holder);
            return Object.freeze(named === undefined ? { kind: 'unnamed' } : { kind: 'asset', type: named.type, key: named.key });
        });
        assets.push(Object.freeze({
            type,
            key,
            status,
            detail: detailOf(kind, asset),
            bytes: bytesOf(kind, asset, found),
            askedBy: Object.freeze(askedBy),
            heldBy: Object.freeze(heldBy),
        }));
    }

    return Object.freeze({
        scenes: Object.freeze(scenes),
        systems: Object.freeze(systems),
        assets: Object.freeze(assets),
    });
};
