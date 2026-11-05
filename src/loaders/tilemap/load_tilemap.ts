import { bumpVersion } from '../../store/record_version';
import { nanoId } from '../../utils';
import { loadAtlas } from '../atlas/load_atlas';
import { newAtlas } from '../atlas/new_atlas';
import { parseTilemapDoc } from './parse_tilemap_doc';
import { resolveAssetPath } from '../resolve_asset_path';
import { trackLoad, whenLoaded } from '../track_load';
import { resolveLayerOrder } from './types/t_tilemap_doc';
import type { TRuntimeStore } from '../../store';
import type { TTilemap, TTilemapLayer } from '../../gameobjects/tilemap/types/t_tilemap';
import { findAssetFile } from '../asset_key';
import { drop, hold } from '../asset_holds';
import type { TLoadedAtlas } from '../atlas/types/t_loaded_atlas';
import type { TTilemapDoc } from './types/t_tilemap_doc';

/**
 * Fills a map in from what it says and the sheet it takes its pictures from, and calls it ready.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillTilemap = (map: TTilemap, doc: TTilemapDoc, atlas: TLoadedAtlas): void => {
    map.atlas = atlas;
    map.cell = doc.cell;
    map.width = doc.width;
    map.height = doc.height;
    map.tiles = doc.tiles;
    map.layers = doc.layers.map((layer): TTilemapLayer => {
        return {
            type: 'tilemap',
            id: nanoId(),
            name: layer.name,
            map,
            // All by reference: moving the map moves its layers, and tinting it tints them,
            // with nothing to keep in step.
            transform: map.transform,
            texture: atlas.texture,
            tint: map.tint,
            smooth: map.smooth,
            data: layer.data,
            order: layer.order,
            zIndex: resolveLayerOrder(layer.order),
            ...(layer.parallax !== undefined ? { parallax: { ...layer.parallax } } : {}),
            destroyed: false,
        };
    });
    map.status = 'ready';
    bumpVersion(map);
};

/**
 * Fetches a `.tilemap` and the sheet it names, filling the record in place as they arrive.
 *
 * Never rejects. A missing file, a broken one or a sheet that will not load ends as `'error'` with a
 * warning, and the map simply draws nothing: one bad level must not take the game down with it.
 *
 * The corners are **not** built here. `createTilemap` builds them once the map is ready, in the same
 * step that builds them again when a tile changes, and one path is easier to trust than two.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadTilemap = async (store: TRuntimeStore, map: TTilemap): Promise<void> => {
    // Asked after each wait: the map may have been let go of meanwhile.
    const letGo = (): boolean => map.status === 'released';
    let noted: TLoadedAtlas | null = null;
    try {
        const response = await fetch(map.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const doc = parseTilemapDoc(await response.json(), map.src);
        if (letGo()) {
            return;
        }

        // The sheet's path as the file writes it: relative to the map, not to the page. The same
        // rule, and now the same code, the atlas loader follows for its image.
        const atlasSrc = resolveAssetPath(map.src, doc.atlas);
        const atlases = store.get('assets').atlases;
        // Through the same cache as everything else, so a map and the characters walking over it
        // share one sheet instead of loading it twice.
        const found = findAssetFile(atlases, atlasSrc);
        const atlas = found ?? newAtlas(atlasSrc, atlasSrc);
        // Noted before waiting, not once the sheet is here: an effect on the same sheet let go of
        // meanwhile must leave it for this map.
        hold(atlas, map);
        noted = atlas;
        if (found === undefined) {
            atlases.set(atlasSrc, atlas);
            // Tracked, so a second map on the same sheet that asks while this one is still on its
            // way waits for it rather than finding it unfinished and calling it broken.
            const loading = loadAtlas(store, atlas);
            trackLoad(atlas, loading);
            await loading;
        } else {
            // In the cache already, which does not mean it has arrived: a scene that asks for the
            // sheet itself, for the sprites that come out of the map, starts the very same load a
            // moment earlier. Waiting for the one that exists is the whole point of sharing it.
            // Reading its status without waiting called a sheet mid-flight a broken sheet, and the
            // map drew nothing.
            await whenLoaded(atlas);
        }
        if (letGo()) {
            // Let go of while it waited: it holds the sheet no more, and one the game let go of
            // meanwhile, which waited for this map, goes now.
            drop(atlas, map);
            return;
        }
        if (atlas.status !== 'ready') {
            throw new Error(`its atlas '${atlasSrc}' could not be loaded`);
        }

        fillTilemap(map, doc, atlas);
    } catch (error: unknown) {
        // A map that draws nothing uses no sheet.
        if (noted !== null) {
            drop(noted, map);
        }
        // One let go of on the way has nothing to say: it was not wanted any more.
        if (letGo()) {
            return;
        }
        map.status = 'error';
        bumpVersion(map);
        console.warn(`[NacatamalOn] createTilemap: '${map.src}' could not be loaded. It draws nothing.`, error);
    }
};
