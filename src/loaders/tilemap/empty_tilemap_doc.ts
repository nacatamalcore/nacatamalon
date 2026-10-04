import { TILEMAP_FORMAT } from './types/t_tilemap_doc';
import type { TTileDoc, TTilemapDoc } from './types/t_tilemap_doc';

/**
 * A blank map that the reader accepts: one empty layer under the characters, and a table that
 * declares the first `frames` frames of the sheet as tiles `1` onwards.
 *
 * It sits next to the reader so the two cannot drift: whatever the reader starts asking for, this is
 * the function that has to keep giving it, and a new map is never a broken one. Passing the sheet's
 * frame count is what makes a new map paintable straight away, since a sheet's frames are its tiles.
 * The ids start at `1` because `0` always means empty.
 * @param options - The sheet it is cut from, and how big the map is.
 * @returns The new map.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const emptyTilemapDoc = (options: {
    /**
     * Where the `.atlas` is, relative to the map.
     */
    atlas: string;
    /**
     * How big a cell is, in pixels. `16` when left out.
     */
    cell?: number;
    /**
     * How many cells across. `20` when left out.
     */
    width?: number;
    /**
     * How many cells down. `15` when left out.
     */
    height?: number;
    /**
     * How many of the sheet's frames to declare as tiles. None when left out.
     */
    frames?: number;
    /**
     * The name of the one layer it starts with. `'ground'` when left out.
     */
    layer?: string;
}): TTilemapDoc => {
    const width = options.width ?? 20;
    const height = options.height ?? 15;

    const tiles: Record<number, TTileDoc> = {};
    for (let frame = 0; frame < (options.frames ?? 0); frame++) {
        tiles[frame + 1] = { frame, solid: false, blocksBullets: false };
    }

    return {
        format: TILEMAP_FORMAT,
        kind: 'tilemap',
        atlas: options.atlas,
        cell: options.cell ?? 16,
        width,
        height,
        tiles,
        layers: [{ name: options.layer ?? 'ground', order: 'under', data: new Array<number>(width * height).fill(0) }],
    };
};
