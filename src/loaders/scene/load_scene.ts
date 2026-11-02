import { bumpVersion } from '../../store/record_version';
import { parseSceneDoc } from '../../scene/document/parse_scene_doc';
import { loadAssets, sceneFromDoc, sourceOfScene } from '../../scene/document/scene_from_doc';
import { registerScene } from '../../scene/register_scene';
import { newBox } from '../../box/new_box';
import { withActiveBox, withActiveGame } from '../../store';
import { trackLoad, whenLoaded } from '../track_load';
import { loadTilemap, newTilemap } from '../tilemap';
import { assetKey } from '../asset_key';
import { SCENE_FORMAT } from '../../scene/document/types/t_scene_doc';
import type { TRuntimeStore } from '../../store';
import type { TLoadedScene } from './types/t_loaded_scene';
import type { TLoadable } from '../types/t_loadable';
import type { TBoxNode } from '../../scene/document/types/t_scene_doc';

/**
 * Whether the game ended or the record was let go of while the file was on its way: then what
 * arrives is thrown away.
 */
const gone = (store: TRuntimeStore, scene: TLoadedScene): boolean => store.get('loop').destroyed || scene.status === 'released';

/**
 * Asks for the maps a document's boxes show, under the key `createTilemap` keeps them by, and adds
 * each to `into`. A map is not in the document's list of assets: the thing showing it asks for it,
 * when the scene starts, so a scene loaded ahead would otherwise start with its maps still to come.
 */
const askForMaps = (store: TRuntimeStore, box: TBoxNode, into: TLoadable[]): void => {
    const { tilemaps } = store.get('assets');
    for (const component of box.components) {
        if (component.type !== 'tilemap') continue;
        let map = tilemaps.get(component.map);
        if (map === undefined) {
            map = newTilemap(component.map);
            tilemaps.set(component.map, map);
            trackLoad(map, loadTilemap(store, map));
        }
        into.push(map);
    }
    for (const child of box.children) askForMaps(store, child, into);
};

/**
 * Fetches a scene document, adds it to the game under its own name, and asks for what it uses.
 *
 * The scene can be started as soon as it is added, and what it uses goes on arriving. The record is
 * `'ready'` only once all of that has arrived too, so a loading scene waiting on it moves on to a
 * scene with nothing left to pop in.
 *
 * Never rejects. A file that is missing or unreadable, or whose name the game already has for
 * another scene, ends as `'error'` with a warning, and nothing is added. The same file loaded again
 * finds its scene already added, and only asks again for what it uses.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadScene = async (store: TRuntimeStore, scene: TLoadedScene): Promise<void> => {
    try {
        const response = await fetch(scene.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        // Says itself what is wrong with a file that is not a scene, and gives it no name. A document
        // in an envelope (`{ format, scene }`, as a pack's scene files are) is read from inside it.
        const raw = await response.json() as Record<string, unknown> | null;
        const enveloped = raw !== null && raw.format !== SCENE_FORMAT && typeof raw.scene === 'object' && raw.scene !== null;
        const doc = parseSceneDoc(enveloped ? raw.scene : raw, scene.src);
        if (gone(store, scene)) {
            return;
        }
        if (doc.name === '') {
            scene.status = 'error';
            bumpVersion(scene);
            return;
        }
        const file = assetKey(scene.src);
        const taken = store.get('world').names.get(doc.name);
        // Added from this same file already (by the game's start, or loaded before under another key or
        // before being let go of): it is found there, and only what it uses is asked for again.
        const sameFile = taken !== undefined && assetKey(sourceOfScene(taken) ?? '') === file;
        if (taken !== undefined && !sameFile) {
            scene.status = 'error';
            bumpVersion(scene);
            console.warn(`[NacatamalOn] useLoadScene: '${scene.src}' is the scene "${doc.name}", and the game already has a scene called that. It is left out; rename one of them in its document, or load the file once.`);
            return;
        }

        // Asked for now, on a box of their own that only collects them, so they are waited on here.
        // Each is kept by the game like any other asset, and the scene finds them when it starts.
        // Before the scene is added, so a scene that is added is never one that failed.
        const asking = newBox(doc.name);
        withActiveGame(store, () => withActiveBox(store, asking, () => loadAssets(doc.assets, scene.src)));
        askForMaps(store, doc.root, asking.loads);

        if (taken === undefined) {
            registerScene(store, doc.name, sceneFromDoc(doc, scene.src));
        }
        scene.name = doc.name;
        bumpVersion(scene);

        await Promise.all(asking.loads.map(whenLoaded));
        if (gone(store, scene)) {
            return;
        }

        scene.status = 'ready';
        bumpVersion(scene);
    } catch (error: unknown) {
        if (gone(store, scene)) {
            return;
        }
        scene.status = 'error';
        bumpVersion(scene);
        console.warn(`[NacatamalOn] useLoadScene: '${scene.src}' could not be loaded. Check the path is right from the page, and that the file is a scene the editor saved.`, error);
    }
};
