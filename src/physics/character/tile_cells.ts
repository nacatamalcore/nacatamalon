import { tileInfoAt, tilemapPlacement } from '../../gameobjects/tilemap/tile_queries';
import type { TTilemap } from '../../gameobjects/tilemap/types/t_tilemap';
import type { TTileDoc } from '../../loaders/tilemap/types/t_tilemap_doc';

/**
 * The cells of the maps as what moves on them reads them: what is solid, what is a ledge, and what
 * is a slope. Shared by the character that walks on the maps alone (`useTileBody2d`) and by the retro
 * world, so a map means the same to both.
 */

/**
 * One map as a body reads it: where its cells are in the world, and how big.
 *
 * @internal
 */
export type TGrid = { map: TTilemap; x: number; y: number; w: number; h: number };

/**
 * @internal
 */
export type TCell = { solid: boolean; oneWay: boolean; slope: [number, number] | undefined };

/**
 * What a cell is, across every layer: a wall on any layer is a wall.
 *
 * @internal
 */
export const cellOf = (map: TTilemap, column: number, row: number): TCell => {
    const cell: TCell = { solid: false, oneWay: false, slope: undefined };
    for (let layer = 0; layer < map.layers.length; layer++) {
        const tile = tileInfoAt(map, layer, column, row);
        if (tile === undefined) continue;
        if (tile.solid === true) cell.solid = true;
        if (tile.oneWay === true) cell.oneWay = true;
        if (tile.slope !== undefined && cell.slope === undefined) cell.slope = tile.slope;
    }
    return cell;
};

/**
 * The tile of a cell that says something about standing on it, across every layer: the first that
 * is solid, a ledge or a slope, for what a game wrote on it (`push`, `props`).
 *
 * @internal
 */
export const groundTileOf = (map: TTilemap, column: number, row: number): TTileDoc | undefined => {
    for (let layer = 0; layer < map.layers.length; layer++) {
        const tile = tileInfoAt(map, layer, column, row);
        if (tile !== undefined && (tile.solid === true || tile.oneWay === true || tile.slope !== undefined)) return tile;
    }
    return undefined;
};

/**
 * Whether the cell at `column, row` is solid; off the map it is not.
 *
 * @internal
 */
export const solidAtCell = (grid: TGrid, column: number, row: number): boolean =>
    column >= 0 && row >= 0 && column < grid.map.width && row < grid.map.height && cellOf(grid.map, column, row).solid;

/**
 * Calls `visit` for every cell of every map that a rectangle of the world overlaps, edges that only
 * meet left out.
 *
 * @internal
 */
export const eachCell = (
    grids: readonly TGrid[],
    left: number, top: number, right: number, bottom: number,
    visit: (grid: TGrid, column: number, row: number, cellLeft: number, cellTop: number) => void,
): void => {
    for (const grid of grids) {
        const c0 = Math.max(0, Math.floor((left - grid.x) / grid.w));
        const c1 = Math.min(grid.map.width - 1, Math.ceil((right - grid.x) / grid.w) - 1);
        const r0 = Math.max(0, Math.floor((top - grid.y) / grid.h));
        const r1 = Math.min(grid.map.height - 1, Math.ceil((bottom - grid.y) / grid.h) - 1);
        for (let row = r0; row <= r1; row++) {
            for (let column = c0; column <= c1; column++) {
                visit(grid, column, row, grid.x + column * grid.w, grid.y + row * grid.h);
            }
        }
    }
};

/**
 * The maps as grids of the world. A turned map is left out, and `turned` is told about it: a map can
 * be moved and scaled, not turned.
 *
 * @internal
 */
export const gridsOf = (maps: readonly TTilemap[], turned: (map: TTilemap) => void): TGrid[] => {
    const grids: TGrid[] = [];
    for (const map of maps) {
        const place = tilemapPlacement(map);
        if (place.rotation !== 0) {
            turned(map);
            continue;
        }
        grids.push({ map, x: place.x, y: place.y, w: map.cell * Math.abs(place.scaleX), h: map.cell * Math.abs(place.scaleY) });
    }
    return grids;
};

/**
 * The height of a slope cell's surface at `x`, in the world: its left and right heights are
 * fractions of the cell, from its bottom.
 *
 * @internal
 */
export const slopeSurfaceAt = (slope: [number, number], cellLeft: number, cellTop: number, w: number, h: number, x: number): number => {
    const along = Math.min(1, Math.max(0, (x - cellLeft) / w));
    return cellTop + h * (1 - (slope[0] + (slope[1] - slope[0]) * along));
};
