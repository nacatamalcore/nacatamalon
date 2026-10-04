import { bumpVersion } from '../../store/record_version';
import { nanoId } from '../../utils';
import { loadAtlas } from '../atlas/load_atlas';
import { newAtlas } from '../atlas/new_atlas';
import { parseTilemapDoc } from './parse_tilemap_doc';
import { resolveAssetPath } from '../resolve_asset_path';
import { whenLoaded } from '../track_load';
import { resolveLayerOrder } from './types/t_tilemap_doc';
import type { TRuntimeStore } from '../../store';
import type { TTilemap, TTilemapLayer } from '../../gameobjects/tilemap/types/t_tilemap';

/**
 * An empty batch: what a layer has before its corners have been built.
 */

/**
 * Fetches a `.tilemap` and the sheet it names, filling the record in place as they arrive.
 *
 * Never rejects. A missing file, a broken one or a sheet that will not load ends as `'error'` with a
 * warning, and the map simply draws nothing: one bad level must not take the game down with it.
 *
 * The corners are **not** built here. They are built by the frame that finds the map ready, because
 * that is also where they are built again when a tile changes, and one path is easier to trust than
 * two.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadTilemap = async (store: TRuntimeStore, map: TTilemap): Promise<void> => {
    try {
        const response = await fetch(map.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const doc = parseTilemapDoc(await response.json(), map.src);

        // The sheet's path as the file writes it: relative to the map, not to the page. The same
        // rule, and now the same code, the atlas loader follows for its image.
        const atlasSrc = resolveAssetPath(map.src, doc.atlas);
        const atlases = store.get('assets').atlases;
        // Through the same cache as everything else, so a map and the characters walking over it
        // share one sheet instead of loading it twice.
        let atlas = atlases.get(atlasSrc);
        if (atlas === undefined) {
            atlas = newAtlas(atlasSrc, atlasSrc);
            atlases.set(atlasSrc, atlas);
            await loadAtlas(store, atlas);
        } else {
            // In the cache already, which does not mean it has arrived: a scene that asks for the
            // sheet itself, for the sprites that come out of the map, starts the very same load a
            // moment earlier. Waiting for the one that exists is the whole point of sharing it.
            // Reading its status without waiting called a sheet mid-flight a broken sheet, and the
            // map drew nothing.
            await whenLoaded(atlas);
        }
        if (atlas.status !== 'ready') {
            throw new Error(`its atlas '${atlasSrc}' could not be loaded`);
        }

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
                destroyed: false,
            };
        });
        map.status = 'ready';
        bumpVersion(map);
    } catch (error: unknown) {
        map.status = 'error';
        bumpVersion(map);
        console.warn(`[NacatamalOn] createTilemap: '${map.src}' could not be loaded. It draws nothing.`, error);
    }
};
