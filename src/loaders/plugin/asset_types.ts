import { rootOf } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { bumpVersion, markWatchable } from '../../store/record_version';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { firstTimeIn } from '../../utils/first_time_in';
import { getAudioManager } from '../../audio';
import { GAME, hold, stopCounting } from '../asset_holds';
import { assetKey, findAssetFile } from '../asset_key';
import { fetchAsset } from '../fetch_asset';
import { warnIfKeyTaken } from '../key_taken';
import { resolveAssetPath } from '../resolve_asset_path';
import { trackLoad, whenLoaded } from '../track_load';
import { loadTexture } from '../texture/load_texture';
import { newTexture } from '../texture/new_texture';
import { loadAudio } from '../audio/load_audio';
import { newAudio } from '../audio/new_audio';
import type { TRuntimeStore } from '../../store';
import type { TLoadable } from '../types/t_loadable';
import type { TTexture } from '../texture/types/t_texture';
import type { TAudioClip } from '../audio/types/t_audio_clip';
import type { TAssetType, TAssetTypeDefinition, TAssetTypeHelp, TPluginAsset } from './types';

/**
 * Every kind of file the page was taught, by name, with the hook made for it.
 */
const kinds = new Map<string, { definition: TAssetTypeDefinition<unknown>; type: TAssetType<unknown> }>();

/**
 * The plugin files each one being loaded is waiting for, so a file that would wait for one waiting
 * for it (directly, or through others, however each was started) is said instead of waiting for ever.
 * Emptied when the load ends.
 */
const waitsOn = new WeakMap<TPluginAsset, Set<TPluginAsset>>();

/**
 * Whether `from` waits, through any chain of files still loading, for `to`.
 */
const reaches = (from: TPluginAsset, to: TPluginAsset, seen = new Set<TPluginAsset>()): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    for (const next of waitsOn.get(from) ?? []) {
        if (reaches(next, to, seen)) return true;
    }
    return false;
};

/**
 * The kind of file registered as `kind`, or `undefined`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const assetTypeOf = (kind: string): TAssetTypeDefinition<unknown> | undefined => kinds.get(kind)?.definition;

/**
 * A picture a plugin's file names, from the game's cache like any other, so a file and the game that
 * both load one fetch it once.
 */
const sharedTexture = (store: TRuntimeStore, path: string): TTexture => {
    const { textures } = store.get('assets');
    let texture = findAssetFile(textures, path);
    if (texture === undefined) {
        texture = newTexture(path, path);
        textures.set(path, texture);
        trackLoad(texture, loadTexture(store, texture));
    }
    return texture;
};

/**
 * A sound a plugin's file names, shared the same way.
 */
const sharedAudio = (store: TRuntimeStore, path: string): TAudioClip => {
    const { sounds } = store.get('assets');
    let clip = findAssetFile(sounds, path);
    if (clip === undefined) {
        clip = newAudio(path, path);
        sounds.set(path, clip);
        const { context } = getAudioManager(store);
        trackLoad(clip, loadAudio(store, clip, (data) => context.decodeAudioData(data)));
    }
    return clip;
};

/**
 * Reads what was fetched the way the kind asked.
 */
const readAs = async (response: Response, read: TAssetTypeDefinition['read']): Promise<unknown> =>
    read === 'json' ? response.json() : read === 'text' ? response.text() : response.arrayBuffer();

/**
 * Fetches a plugin's file, has its kind make what the game uses of it, and waits for everything it
 * asked for. Never rejects: a file that is missing or that its kind cannot read ends as `'error'`,
 * said once in its kind's name, and what was waiting for it goes without.
 */
const loadPluginAsset = async (store: TRuntimeStore, asset: TPluginAsset): Promise<void> => {
    const definition = kinds.get(asset.kind)!.definition;
    // Let go of, or the game gone, while it was on its way: nobody is waiting for it any more.
    const gone = (): boolean => store.get('loop').destroyed || asset.status === 'released';
    const asked: TLoadable[] = [];
    // Let go of while `parse` was still at it: nothing more is asked for in its name, or it would be
    // loaded for nobody and held by a file that is gone.
    const stillWanted = (): void => {
        if (gone()) throw new Error('it was let go of while it was being read');
    };
    const help: TAssetTypeHelp = {
        src: asset.src,
        texture: (path) => {
            stillWanted();
            const texture = sharedTexture(store, resolveAssetPath(asset.src, path));
            hold(texture, asset);
            asked.push(texture);
            return texture;
        },
        audio: (path) => {
            stillWanted();
            const clip = sharedAudio(store, resolveAssetPath(asset.src, path));
            hold(clip, asset);
            asked.push(clip);
            return clip;
        },
        asset: <T>(kind: string, path: string): TPluginAsset<T> => {
            stillWanted();
            const named = pluginAssetIn(store, kind, resolveAssetPath(asset.src, path));
            // Waiting for one that waits for this one, by any way round, would never end.
            if (named.status === 'loading' && reaches(named, asset)) {
                throw new Error(`it names '${named.src}', which is waiting for it: files that name each other never finish`);
            }
            if (named.status === 'loading') {
                const waiting = waitsOn.get(asset) ?? new Set<TPluginAsset>();
                waiting.add(named);
                waitsOn.set(asset, waiting);
            }
            hold(named, asset);
            asked.push(named);
            return named as TPluginAsset<T>;
        },
    };
    try {
        const response = await fetchAsset(asset.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const content = await readAs(response, definition.read);
        if (gone()) {
            return;
        }
        const data = await definition.parse(content, help);
        // In the store is not the same as arrived: what it asked for may still be on its way.
        await Promise.all(asked.map((record) => whenLoaded(record)));
        if (gone()) {
            // Made for nobody: let go of at once.
            if (data !== null && data !== undefined) definition.release?.(data);
            return;
        }
        asset.data = data;
        asset.status = 'ready';
        bumpVersion(asset);
    } catch (error: unknown) {
        // Let go of, or the game gone: nobody is waiting to hear it did not arrive.
        if (gone()) {
            return;
        }
        asset.status = 'error';
        // What it asked for no longer counts as held by it, so the game letting go of one of those is
        // not kept waiting on a file that will never be anything; it still knows them, so letting the
        // file go later takes those only it asked for.
        stopCounting(asset);
        bumpVersion(asset);
        console.warn(`[NacatamalOn] ${asset.kind}: '${asset.src}' could not be loaded. What uses it goes without.`, error);
    } finally {
        waitsOn.delete(asset);
    }
};

/**
 * The game's record of a plugin's file under `key` (default the path, as the page resolves it),
 * started the first time it is asked for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pluginAssetIn = (store: TRuntimeStore, kind: string, src: string, key?: string): TPluginAsset => {
    if (!kinds.has(kind)) {
        throw new Error(`[NacatamalOn] '${kind}' is not a kind of file the game knows. Install the plugin that registers it (registerAssetType) before the game loads one.`);
    }
    const { pluginAssets } = store.get('assets');
    const cacheKey = key ?? assetKey(src);
    // A file named by another is found under any key the game gave it.
    let asset = key === undefined ? pluginAssets.get(cacheKey) ?? findAssetFile(pluginAssets, cacheKey) : pluginAssets.get(cacheKey);
    if (asset !== undefined && asset.kind !== kind) {
        throw new Error(`[NacatamalOn] ${kind}: the key '${cacheKey}' already names a '${asset.kind}' file. Give this one a key of its own.`);
    }
    if (asset !== undefined) {
        warnIfKeyTaken(kind, cacheKey, asset.src, src);
        return asset;
    }
    asset = markWatchable({ type: 'plugin-asset', kind, key: cacheKey, src, status: 'loading', data: null }) as TPluginAsset;
    pluginAssets.set(cacheKey, asset);
    trackLoad(asset, loadPluginAsset(store, asset));
    return asset;
};

/**
 * Teaches the engine a kind of file, for a plugin: the engine fetches it, reads it as the kind says
 * (JSON, text or bytes) and hands it to `parse`, which makes what the game uses of it and can ask
 * for what the file names (a picture, a sound, another file), loaded next to it. The record is kept,
 * counted by `useLoadProgress` (so a loading scene waits for it, and a headless game's `loaded()`), and let
 * go of with `releaseAsset` like the engine's own files; a scene document can list it among its assets
 * (`{ type: 'plugin', kind, key, src }`).
 *
 * Returns the kind's loading hook, which the plugin exports under its own name. The same kind with
 * the same definition does nothing and hands back the same hook, so an install called twice is
 * harmless when the definition is made once, at the top of the module; with another definition it
 * throws.
 *
 * @param definition Its `kind`, how it is `read`, its `parse` and, if it keeps anything that has to be
 * let go of, its `release`.
 * @returns The kind's name and its loading hook.
 *
 * @example
 * ```ts
 * import { registerAssetType } from 'nacatamalon/extend';
 *
 * type TRig = { bones: string[]; picture: unknown };
 *
 * const RIGS = registerAssetType<TRig>({
 *     kind: 'nacatamalon-ellipsoids-rig',
 *     read: 'json',
 *     parse: (json, help) => {
 *         const doc = json as { bones: string[]; picture: string };
 *         return { bones: doc.bones, picture: help.texture(doc.picture) };
 *     },
 * });
 *
 * export const useLoadRig = RIGS.useLoad;   // useLoadRig({ src: 'rigs/hero.rig.json' })
 * ```
 *
 * @category Extending
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const registerAssetType = <TData = unknown>(definition: TAssetTypeDefinition<TData>): TAssetType<TData> => {
    const { kind } = definition ?? {};
    if (typeof kind !== 'string' || kind === '') {
        throw new Error('[NacatamalOn] registerAssetType: a kind of file needs a name. Start it with the plugin\'s own, as in \'nacatamalon-ellipsoids-rig\'.');
    }
    if (definition.read !== 'json' && definition.read !== 'text' && definition.read !== 'bytes') {
        throw new Error(`[NacatamalOn] registerAssetType: '${kind}' is read as '${String(definition.read)}', and the engine reads a file as 'json', 'text' or 'bytes'.`);
    }
    if (typeof definition.parse !== 'function') {
        throw new Error(`[NacatamalOn] registerAssetType: '${kind}' has no parse. Give it the function that makes what the game uses of the file.`);
    }
    const known = kinds.get(kind);
    if (known !== undefined) {
        if (known.definition !== definition) {
            throw new Error(`[NacatamalOn] registerAssetType: '${kind}' is already registered with another definition. Give this one a name of its own.`);
        }
        return known.type as TAssetType<TData>;
    }
    const type: TAssetType<TData> = {
        kind,
        useLoad: ({ src, key }) => {
            const store = getActiveGame();
            const box = getActiveBox();
            if (store === null || box === null) {
                throw outsideSceneBody(kind);
            }
            const asset = pluginAssetIn(store, kind, src, key) as TPluginAsset<TData>;
            // Asked for by the game, which a file naming the same one does not undo.
            hold(asset, GAME);
            // Listed on the scene even when it came from the cache: `useLoadProgress()` counts it.
            const { loads } = rootOf(box);
            if (!loads.includes(asset)) {
                loads.push(asset);
            }
            return asset;
        },
    };
    kinds.set(kind, { definition: definition as TAssetTypeDefinition<unknown>, type: type as TAssetType<unknown> });
    return type;
};

/**
 * The plugin files a scene document listed, by the box it was built on, so saving it again keeps
 * them in its manifest: the manifest is written from what the scene uses, and nothing in it uses a
 * plugin's file by name yet.
 */
const listedBy = new WeakMap<object, TPluginEntry[]>();

/**
 * A plugin's file as a scene document lists it.
 */
type TPluginEntry = { type: 'plugin'; kind: string; key: string; src: string };

/**
 * Loads a plugin's file a scene document lists, as that kind's hook would, on the scene being built.
 * A kind no plugin registered is said once and left out; the entry is kept for when the scene is
 * saved again either way.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadPluginEntry = (entry: TPluginEntry, documentSrc: string): void => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw outsideSceneBody('sceneFromDoc');
    }
    const listed = listedBy.get(box) ?? [];
    if (!listed.some((one) => one.key === entry.key && one.kind === entry.kind)) {
        listed.push(entry);
        listedBy.set(box, listed);
    }
    const known = kinds.get(entry.kind);
    if (known === undefined) {
        if (firstTimeIn(store, `plugin asset kind: ${entry.kind}`)) {
            console.warn(`[NacatamalOn] sceneFromDoc: '${documentSrc}' lists a '${entry.kind}' file ('${entry.src}'), a kind no plugin taught the game. It is left out; install the plugin that registers it.`);
        }
        return;
    }
    known.type.useLoad({ src: entry.src, key: entry.key });
};

/**
 * The plugin files the document `box` was built from listed, to write back into its manifest.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pluginEntriesOf = (box: object): readonly TPluginEntry[] => listedBy.get(box) ?? [];
