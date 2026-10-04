import { rootOf } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { loadTilemap, newTilemap } from '../../loaders/tilemap';
import { trackLoad } from '../../loaders';
import { useUpdate } from '../../hooks/loop';
import { buildLayerMesh } from './build_layer_mesh';
import { openLayerState } from './layer_state';
import { releaseLayer } from './release_layer';
import { rememberTilemap } from './get_tilemap';
import type { IRenderer } from '../../render';
import type { TTileMesh } from './layer_state';
import type { TTilemap, TTilemapLayer, TTilemapOptions } from './types/t_tilemap';

/**
 * Puts a batch of corners on the graphics card, reusing the memory when what is written still fits.
 *
 * Asking for new memory on every change is what this avoids: a brick broken writes fewer corners
 * into the same place and simply draws fewer of them.
 */
const uploadMesh = (renderer: IRenderer, mesh: TTileMesh, data: Float32Array): void => {
    if (data.length === 0) {
        mesh.vertexCount = 0;
        return;
    }
    if (mesh.buffer === null || data.length > mesh.capacity) {
        if (mesh.buffer !== null) {
            renderer.destroyBuffer(mesh.buffer);
        }
        mesh.buffer = renderer.createBuffer(data, 'vertex');
        mesh.capacity = data.length;
    } else {
        renderer.updateBuffer(mesh.buffer, data);
    }
    // Four numbers a corner: where it is, and which piece of the sheet it shows.
    mesh.vertexCount = data.length / 4;
};

/**
 * Builds a layer's corners again and sends them up.
 *
 * @internal
 */
const rebuildLayer = (renderer: IRenderer, layer: TTilemapLayer): void => {
    const state = openLayerState(layer);
    const { still, moving } = buildLayerMesh(layer.map, layer);
    uploadMesh(renderer, state.still, still);
    uploadMesh(renderer, state.moving, moving);
    state.dirty = false;
};

/**
 * Moves every cycling run forward and says whether any of them changed picture.
 *
 * The clocks belong to the map and not to a cell: every torch in a level flickers together, which is
 * what a player expects and what keeps one run from costing as many clocks as it has cells.
 */
const tickClocks = (map: TTilemap, delta: number): boolean => {
    const sheet = map.atlas;
    if (sheet === null) {
        return false;
    }

    let changed = false;
    for (const tile of Object.values(map.tiles)) {
        if (tile.anim === undefined) {
            continue;
        }
        const clip = sheet.sequences[tile.anim];
        if (clip === undefined || clip.frames.length === 0) {
            continue;
        }

        const clock = map.clocks.get(tile.anim) ?? { elapsed: 0, frame: 0 };
        clock.elapsed += delta;
        const step = 1 / (clip.fps ?? 12);
        while (clock.elapsed >= step) {
            clock.elapsed -= step;
            clock.frame = (clock.frame + 1) % clip.frames.length;
            changed = true;
        }
        map.clocks.set(tile.anim, clock);
    }
    return changed;
};

/**
 * Loads a map and draws it: **one call per layer**, however many cells it has.
 *
 * A layer's cells go up as one batch of corners, each one already in its place and carrying the piece
 * of the sheet it shows. That is what makes one call possible: a sprite says "this picture, here",
 * and a thousand cells showing thirty different pieces cannot be said that way. A sprite per cell
 * would cost a place, a colour and a picture per tile, and stops being sensible somewhere around the
 * first map that is not tiny.
 *
 * What comes back is `'loading'` and fills itself in; its layers start drawing once the file and its
 * sheet have arrived, so nothing has to be awaited. `useLoader` counts it like any other asset.
 *
 * Call it in the body of a scene, like everything else. What it draws goes away with that scene.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const map = createTilemap({ src: '/maps/level1.tilemap' });
 *     const player = createSprite({ key: 'hero', zIndex: 0 });
 *
 *     useUpdate((delta) => {
 *         // The ground layer is drawn under the player and the treetops over them, because the
 *         // file says 'under' and 'over' and the player never mentioned a number at all.
 *         if (!solidAtPoint(map, player.transform.x + 8, player.transform.y)) {
 *             player.transform.x += 60 * delta;
 *         }
 *     });
 *
 *     return createScene();
 * };
 * ```
 * @param options - The `.tilemap` file, where it goes, and how it is drawn: see {@link TTilemapOptions}.
 * @returns The map, still loading: its `status` says when it has arrived.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createTilemap = (options: TTilemapOptions): TTilemap => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] createTilemap: call it inside a scene body.');
    }

    const cacheKey = options.key ?? options.src;
    const { tilemaps } = store.get('assets');

    let map = tilemaps.get(cacheKey);
    if (map === undefined) {
        map = newTilemap(options.src);
        tilemaps.set(cacheKey, map);
        trackLoad(map, loadTilemap(store, map));
    }
    const loaded = map;
    rememberTilemap(box, loaded);

    if (options.transform !== undefined) {
        // Written into the object that already exists rather than replacing it: the layers are
        // looking at this one. The defaults go first because the map may come from the cache with
        // another scene's placement, and a field left out means its default, not that placement.
        Object.assign(loaded.transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...options.transform });
    }
    if (options.tint !== undefined) {
        Object.assign(loaded.tint, options.tint);
    }
    loaded.smooth = options.smooth;

    // Listed on the scene even when it came from the cache, so a loading bar counts it.
    const scene = rootOf(box);
    if (!scene.loads.includes(loaded)) {
        scene.loads.push(loaded);
    }

    let added = false;
    useUpdate((delta) => {
        if (loaded.status !== 'ready' || loaded.destroyed) {
            return;
        }
        const renderer = store.get('screen').renderer;

        // The layers start being drawn the frame the map is ready. They are added to whatever asked
        // for the map, so they leave with it.
        if (!added) {
            added = true;
            for (const layer of loaded.layers) {
                layer.smooth = loaded.smooth;
                box.drawables.push(layer);
            }
        }

        // Everything changed since the last frame costs one rebuild, not one per cell.
        for (const layer of loaded.layers) {
            if (openLayerState(layer).dirty) {
                rebuildLayer(renderer, layer);
            }
        }

        if (tickClocks(loaded, delta)) {
            // Only the cycling cells: the still ones are sitting on the card untouched, which is the
            // whole reason they are apart.
            for (const layer of loaded.layers) {
                uploadMesh(renderer, openLayerState(layer).moving, buildLayerMesh(loaded, layer).moving);
            }
        }
    });

    // What it put on the graphics card leaves with whatever asked for it, like every other thing a
    // scene sets up. The map itself stays in the cache, ready to be used again.
    box.cleanups.push(() => {
        for (const layer of loaded.layers) {
            releaseLayer(store.get('screen').renderer, layer);
        }
    });

    return loaded;
};
