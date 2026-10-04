/**
 * The version of the `.tilemap` format this engine writes and reads.
 *
 * Only goes up when a change would leave an older reader unable to cope. A new optional field does
 * not move it.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const TILEMAP_FORMAT = 1;

/**
 * What one tile id **means**. The grid holds numbers; this is the table those numbers point into.
 *
 * A tile has no place and no identity: two bricks are two appearances of the same number, not two
 * things. Whatever needs identity (a chest, where the player starts) is a sprite instead. That is
 * the line this draws, and it is why destroying a tile is writing a number into a cell rather than
 * removing something.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTileDoc = {
    /**
     * Which frame of the sheet to draw: its place in the count, or its name on a packed sheet.
     * Exactly one of this and `anim` is given.
     */
    frame?: number | string;
    /**
     * The name of a run of frames in the sheet to cycle: water, a torch. Exactly one of this and
     * `frame` is given. The run lives in the `.atlas`, so one description drives both this and a
     * sprite's animation.
     */
    anim?: string;
    /**
     * Stops things moving through it. Default `false`.
     */
    solid?: boolean;
    /**
     * Stops shots. Follows `solid` when it does not say, which is right for nearly every tile: water
     * is the exception that earns the field its place, solid to a tank and not to a bullet.
     */
    blocksBullets?: boolean;
    /**
     * What this tile turns into when it is destroyed, `0` for "nothing left".
     *
     * Absent means it cannot be destroyed, which is a different thing from turning into nothing, and
     * that is why it has no default.
     */
    becomes?: number;
};

/**
 * Where a layer draws, next to everything else in the scene.
 *
 * `'under'` and `'over'` mean under and over the **characters**, and they turn into reserved
 * numbers either side of zero. That step is the point: a map is drawn without knowing what numbers a
 * game gives its sprites, and a sprite that never mentions one is already at zero, so a map saying
 * "under" and "over" is right in any scene with nobody having agreed on a number first.
 *
 * A plain number still works, because "above the characters but below the treetops" is a real thing
 * to want and only a number can say it.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTileLayerOrder = 'under' | 'over' | number;

/**
 * The numbers `'under'` and `'over'` turn into.
 *
 * Exported so a game can put something **just** above a map's ground (`TILE_LAYER_BANDS.under + 1`)
 * without writing the number again, and so the two cannot drift apart.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const TILE_LAYER_BANDS = { under: -100, over: 100 } as const;

/**
 * Turns an order into the number everything else is sorted by.
 * @param order - A layer's `order`, a band name or a number.
 * @returns The number layers are sorted by.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const resolveLayerOrder = (order: TTileLayerOrder): number =>
    typeof order === 'number' ? order : TILE_LAYER_BANDS[order];

/**
 * One layer of the map: a flat grid of tile ids, row by row, and where it draws.
 *
 * The order lives here and never on a tile: the same brick can be background in one layer and
 * foreground in another.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTilemapLayerDoc = {
    name: string;
    /**
     * Where it draws. Default `0`, which is where the characters are.
     */
    order: TTileLayerOrder;
    /**
     * `width × height` ids, row by row from the top-left. `0` is empty.
     */
    data: number[];
};

/**
 * What a `.tilemap` file holds: which sheet, how big the cells and the grid are, what the numbers
 * mean, and the layers.
 *
 * The table of tiles is **inside** the map rather than in a file of its own. One file less to keep
 * in step while a first level is being built, and the id is already what ties a number in the grid
 * to what it means. When several levels need to share a table it comes back as an optional field
 * replacing `tiles`: something added to a format that already reads, not a rewrite.
 *
 * @category Tilemaps
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTilemapDoc = {
    format: number;
    kind: 'tilemap';
    /**
     * Where the `.atlas` is whose frames the ids draw, relative to this file.
     */
    atlas: string;
    /**
     * How big a cell is, in pixels. Square: a cell that is not is a different problem.
     */
    cell: number;
    /**
     * How many cells across.
     */
    width: number;
    /**
     * How many cells down.
     */
    height: number;
    /**
     * Id to what it means. `0` is always empty and is never written here.
     */
    tiles: Record<number, TTileDoc>;
    layers: TTilemapLayerDoc[];
};
