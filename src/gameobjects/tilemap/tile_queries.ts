import { openLayerState } from './layer_state';
import type { TTileDoc } from '../../loaders/tilemap/types/t_tilemap_doc';
import type { TTilemap, TTilemapLayer } from './types/t_tilemap';

/**
 * Whether a column and a row are inside the map at all.
 */
const inside = (map: TTilemap, column: number, row: number): boolean =>
    column >= 0 && row >= 0 && column < map.width && row < map.height;

/**
 * Which cell of the map a point of the world falls in.
 *
 * It answers for points outside the map too, with numbers below zero or past the edge: "off the
 * map to the left" is something a game needs to be able to tell, and clamping would say "the first
 * column" instead. `tileAt` and `solidAt` treat those as empty.
 *
 * @example
 * ```ts
 * declare const map: TTilemap;
 * declare const bullet: TSprite;
 *
 * const { column, row } = cellAt(map, bullet.transform.x, bullet.transform.y);
 * ```
 * @param map - The map, as `createTilemap` or `getTilemap` gave it back.
 * @param x - A point in the world.
 * @param y - A point in the world.
 * @returns The cell that point falls in. It can be outside the map.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cellAt = (map: TTilemap, x: number, y: number): { column: number; row: number } => ({
    column: Math.floor((x - map.transform.x) / (map.cell || 1)),
    row: Math.floor((y - map.transform.y) / (map.cell || 1)),
});

/**
 * Where the top-left corner of a cell sits in the world, which is what a game needs to line
 * something up with the grid.
 * @param map - The map, as `createTilemap` or `getTilemap` gave it back.
 * @param column - The cell's column, counting from 0.
 * @param row - The cell's row, counting from 0.
 * @returns Where the cell's top-left corner is in the world.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cellCorner = (map: TTilemap, column: number, row: number): { x: number; y: number } => ({
    x: map.transform.x + column * map.cell,
    y: map.transform.y + row * map.cell,
});

/**
 * The id in a cell of one layer. `0` for empty, and also for anything outside the map.
 *
 * @param layer Which layer, numbered as the file wrote them.
 * @param map - The map, as `createTilemap` or `getTilemap` gave it back.
 * @param column - The cell's column, counting from 0.
 * @param row - The cell's row, counting from 0.
 * @returns The tile's id, `0` when the cell is empty or off the map.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const tileAt = (map: TTilemap, layer: number, column: number, row: number): number => {
    const target = map.layers[layer];
    if (target === undefined || !inside(map, column, row)) {
        return 0;
    }
    return target.data[row * map.width + column];
};

/**
 * What the tile in a cell means, or nothing when the cell is empty or off the map.
 * @param map - The map, as `createTilemap` or `getTilemap` gave it back.
 * @param layer - Which of its layers, counting from 0.
 * @param column - The cell's column, counting from 0.
 * @param row - The cell's row, counting from 0.
 * @returns What the file says about that tile, or `undefined`.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const tileInfoAt = (map: TTilemap, layer: number, column: number, row: number): TTileDoc | undefined =>
    map.tiles[tileAt(map, layer, column, row)];

/**
 * Puts an id into a cell, and says whether anything changed.
 *
 * This is how a tile is destroyed: a cell is a number, so a brick turning to rubble is writing
 * another number, and a brick disappearing is writing `0`. The layer is drawn again on the next
 * frame, once, however many cells were changed.
 *
 * @example
 * ```ts
 * declare const map: TTilemap;
 * declare const column: number;
 * declare const row: number;
 *
 * const tile = tileInfoAt(map, 0, column, row);
 * if (tile?.becomes !== undefined) setTile(map, 0, column, row, tile.becomes);
 * ```
 * @param map - The map, as `createTilemap` or `getTilemap` gave it back.
 * @param layer - Which of its layers, counting from 0.
 * @param column - The cell's column, counting from 0.
 * @param row - The cell's row, counting from 0.
 * @param id - The tile to put there. `0` empties the cell.
 * @returns Whether anything changed: `false` off the map, or when the cell already held `id`.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setTile = (map: TTilemap, layer: number, column: number, row: number, id: number): boolean => {
    const target = map.layers[layer];
    if (target === undefined || !inside(map, column, row)) {
        return false;
    }
    if (id !== 0 && map.tiles[id] === undefined) {
        console.warn(`[NacatamalOn] setTile: '${map.src}' does not describe a tile ${id}, so the cell was left alone.`);
        return false;
    }

    const at = row * map.width + column;
    if (target.data[at] === id) {
        return false;
    }
    target.data[at] = id;
    // Built again once, on the next frame: twenty cells cleared in one update cost one rebuild.
    openLayerState(target).dirty = true;
    return true;
};

/**
 * Whether anything in that cell stops things moving, in **any** layer: a wall painted on the
 * treetops layer still stops the player.
 * @param map - The map, as `createTilemap` or `getTilemap` gave it back.
 * @param column - The cell's column, counting from 0.
 * @param row - The cell's row, counting from 0.
 * @returns Whether any layer has a solid tile in that cell.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const solidAt = (map: TTilemap, column: number, row: number): boolean =>
    map.layers.some((_, layer) => tileInfoAt(map, layer, column, row)?.solid === true);

/**
 * Whether anything in that cell stops a shot. Follows `solid` unless a tile says otherwise, which is
 * what lets water stop a tank and not a bullet.
 * @param map - The map, as `createTilemap` or `getTilemap` gave it back.
 * @param column - The cell's column, counting from 0.
 * @param row - The cell's row, counting from 0.
 * @returns Whether anything in that cell stops a shot.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const blocksBulletsAt = (map: TTilemap, column: number, row: number): boolean =>
    map.layers.some((_, layer) => {
        const tile = tileInfoAt(map, layer, column, row);
        return tile !== undefined && (tile.blocksBullets ?? tile.solid === true);
    });

/**
 * Whether the point of the world falls on something solid. The short way to ask, for a game that
 * only wants to know whether it can walk there.
 * @param map - The map, as `createTilemap` or `getTilemap` gave it back.
 * @param x - A point in the world.
 * @param y - A point in the world.
 * @returns Whether the cell under that point is solid.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const solidAtPoint = (map: TTilemap, x: number, y: number): boolean => {
    const { column, row } = cellAt(map, x, y);
    return solidAt(map, column, row);
};

/**
 * Tells the engine that a layer's cells were written directly, so its corners have to be built
 * again.
 *
 * `setTile` says this for you, and for one cell at a time it is what you want. This is the other
 * case: writing a whole grid back in one go (restoring a level, loading a save) through `data`, where
 * going through `setTile` would mean one call per cell for an answer you already have.
 *
 * The rebuild happens on the next frame and once, however many times this is said, so saying it
 * after every row costs nothing extra.
 *
 * @example
 * ```ts
 * declare const layer: TTilemapLayer;
 * declare const original: number[];
 *
 * for (let cell = 0; cell < original.length; cell++) layer.data[cell] = original[cell];
 * markLayerChanged(layer);
 * ```
 * @param layer - The layer whose `data` was changed by hand.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const markLayerChanged = (layer: TTilemapLayer): void => {
    openLayerState(layer).dirty = true;
};
