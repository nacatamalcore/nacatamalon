import { getColor } from '../../color';
import { rootOf } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { loadTilemap, newTilemap, tilemapFromDoc } from '../../loaders/tilemap';
import { trackLoad, whenLoaded } from '../../loaders';
import { useUpdate } from '../../hooks/loop';
import { buildLayerMesh } from './build_layer_mesh';
import { TILE_CORNER_FLOATS } from '../../render/shared/tile_corner';
import { openLayerState } from './layer_state';
import { releaseLayer } from './release_layer';
import { noteMapInCode, rememberTilemap } from './get_tilemap';
import type { TBox } from '../../box/types/t_box';
import type { IRenderer } from '../../render';
import type { TRuntimeStore } from '../../store';
import type { TTileMesh } from './layer_state';
import type { TTilemap, TTilemapLayer, TTilemapOptions } from './types/t_tilemap';
import { assetKey } from '../../loaders/asset_key';
import { outsideSceneBody } from '../../utils/outside_scene_body';

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
    // Eight numbers a corner: where it is, which point of the sheet it shows, and its cell's window.
    mesh.vertexCount = data.length / TILE_CORNER_FLOATS;
};

/**
 * Builds a layer's corners again and sends them up.
 *
 * @internal
 */
const rebuildLayer = (renderer: IRenderer, layer: TTilemapLayer): void => {
    const state = openLayerState(layer);
    const { still, moving, firstVertex } = buildLayerMesh(layer.map, layer);
    uploadMesh(renderer, state.still, still);
    uploadMesh(renderer, state.moving, moving);
    state.still.grid = { columns: layer.map.width, rows: layer.map.height, cell: layer.map.cell, firstVertex };
    state.dirty = false;
};

/**
 * Which `createTilemap` call moves each map's clocks, and how many times it has. A map in the cache
 * can be asked for by several, each with its own update, and all of them moving the one set of clocks
 * ran its tiles that many times as fast. Another takes over when it finds them not moved since it last
 * looked, whatever the reason: the one moving them left, or its scene is paused.
 */
const clockKeepers = new WeakMap<TTilemap, { keeper: object; moved: number }>();

/**
 * The runs already moved on this frame, kept to save asking for a new set per map per frame.
 */
const ticked = new Set<string>();

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
    // Each run once, however many tiles cycle it: water with a flipped twin must not flow twice as fast.
    ticked.clear();
    for (const tile of Object.values(map.tiles)) {
        if (tile.anim === undefined || ticked.has(tile.anim)) {
            continue;
        }
        ticked.add(tile.anim);
        const clip = sheet.sequences[tile.anim];
        if (clip === undefined || clip.frames.length === 0) {
            continue;
        }

        const clock = map.clocks.get(tile.anim) ?? { elapsed: 0, frame: 0 };
        clock.elapsed += delta;
        const step = 1 / (clip.fps ?? 12);
        // Worked out and not counted one by one: nothing has to happen on the frames passed over, and
        // a pace of a million must cost what a pace of ten does. A step of nothing, or less, goes
        // nowhere.
        if (step > 0 && clock.elapsed >= step) {
            const passed = Math.floor(clock.elapsed / step);
            clock.elapsed -= passed * step;
            clock.frame = (clock.frame + passed) % clip.frames.length;
            changed = true;
        }
        map.clocks.set(tile.anim, clock);
    }
    return changed;
};

/**
 * The map in `src`, from the game's cache, or starting to load if it is not there yet.
 */
const mapFromFile = (store: TRuntimeStore, src: string, key: string | undefined): TTilemap => {
    const cacheKey = key ?? assetKey(src);
    const { tilemaps } = store.get('assets');

    let map = tilemaps.get(cacheKey);
    if (map === undefined) {
        map = newTilemap(src);
        tilemaps.set(cacheKey, map);
        trackLoad(map, loadTilemap(store, map));
    }
    return map;
};

/**
 * A map made from a document in code. It belongs to `box` alone, so it leaves with it for good: off
 * the scene's maps and its loads, and no longer using its sheet.
 */
const mapInCode = (options: TTilemapOptions, box: TBox, scene: TBox): TTilemap => {
    if (options.doc === undefined || options.src !== undefined) {
        throw new Error(`[NacatamalOn] createTilemap: it was given ${options.doc === undefined ? 'neither a src nor a doc' : 'both a src and a doc'}. Give src, a .tilemap file, or doc and atlas, a map written in code.`);
    }
    const { map, letGo } = tilemapFromDoc(options.doc, options.atlas, options.sequences);
    const forget = noteMapInCode(scene, map);
    box.cleanups.push(() => {
        forget();
        const at = scene.loads.indexOf(map);
        if (at !== -1) {
            scene.loads.splice(at, 1);
        }
        letGo();
    });
    return map;
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
 * **A level generated in code** has no file: give `doc` (what a `.tilemap` holds) and `atlas` (its
 * sheet, as an object) instead of `src`. It is ready at once when the sheet is, and everything else
 * works the same: `useTileBody2d`, `solidAt`, `setTile`, `useCameraFollow(hero, { bounds: map })`. It is in
 * no cache, so each call makes a map of its own, and it goes with what asked for it.
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
 * @example
 * ```ts
 * declare const grass: string[];
 * declare const ledge: string[];
 * declare const palette: TPixelPalette;
 *
 * const tiles = sheetFromRows({ grass, ledge }, palette);
 * const map = createTilemap({
 *     doc: {
 *         cell: 8, width: 4, height: 2,
 *         tiles: { 1: { frame: tiles.frames.grass, solid: true }, 2: { frame: tiles.frames.ledge, oneWay: true } },
 *         layers: [{ name: 'ground', order: 'under', data: [0, 2, 2, 0, 1, 1, 1, 1] }],
 *     },
 *     atlas: createSpriteAtlas({ texture: createPixelTexture(tiles.pixels), columns: tiles.columns }),
 * });
 * ```
 * @param options - The `.tilemap` file, or the map and its sheet in code, where it goes, and how it
 * is drawn: see {@link TTilemapOptions}.
 * @returns The map: from a file still loading, and its `status` says when it has arrived.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createTilemap = (options: TTilemapOptions): TTilemap => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw outsideSceneBody('createTilemap');
    }

    const scene = rootOf(box);
    const fromCode = options.doc !== undefined || options.src === undefined;
    const loaded = options.doc !== undefined || options.src === undefined
        ? mapInCode(options, box, scene)
        : mapFromFile(store, options.src, options.key);
    rememberTilemap(box, loaded);

    if (options.transform !== undefined) {
        // Written into the object that already exists rather than replacing it: the layers are
        // looking at this one. The defaults go first because the map may come from the cache with
        // another scene's placement, and a field left out means its default, not that placement.
        Object.assign(loaded.transform, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...options.transform });
    }
    if (options.tint !== undefined) {
        Object.assign(loaded.tint, getColor(options.tint));
    }
    loaded.smooth = options.smooth;

    // Listed on the scene even when it came from the cache, so a loading bar counts it.
    if (!scene.loads.includes(loaded)) {
        scene.loads.push(loaded);
    }

    const thisCall = {};
    let movedWhenSeen = -1;
    let added = false;
    // A map still on its way can land after what asked for it has gone, and nothing would ever let go
    // of what it put on the card then.
    let left = false;
    const settle = (): void => {
        if (left || loaded.status !== 'ready' || loaded.destroyed) {
            return;
        }
        const renderer = store.get('screen').renderer;

        // The layers start being drawn once the map is ready. They are added to whatever asked for
        // the map, so they leave with it.
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
    };

    // Not left to the next frame: a game run without a browser can ask for a picture with no frame in
    // between, and the map has to be in it. One made in code that is ready is there in the order it was
    // asked for, as a sprite is; any other joins after the scene's body, as a file's always has.
    if (fromCode && loaded.status === 'ready') {
        settle();
    } else {
        void whenLoaded(loaded).then(settle);
    }

    useUpdate((delta) => {
        settle();
        if (loaded.status !== 'ready' || loaded.destroyed) {
            return;
        }
        let clocks = clockKeepers.get(loaded);
        if (clocks === undefined) {
            clocks = { keeper: thisCall, moved: 0 };
            clockKeepers.set(loaded, clocks);
        }
        if (clocks.keeper !== thisCall) {
            if (clocks.moved !== movedWhenSeen) {
                movedWhenSeen = clocks.moved;
                return;
            }
            clocks.keeper = thisCall;
        }
        clocks.moved += 1;
        const renderer = store.get('screen').renderer;

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
        left = true;
        for (const layer of loaded.layers) {
            releaseLayer(store.get('screen').renderer, layer);
        }
    });

    return loaded;
};
