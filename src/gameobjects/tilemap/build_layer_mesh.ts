import { atlasFrame } from '../../atlas';
import type { TAtlasFrame, TSpriteAtlas } from '../../atlas';
import type { TTilemap, TTilemapLayer } from './types/t_tilemap';

/**
 * Two triangles per cell, three corners each, four numbers per corner: where it is and what it shows.
 */
const FLOATS_PER_CELL = 6 * 4;

/**
 * Writes one cell's two triangles and says where the next one starts.
 *
 * The corners carry the cell's own place inside the map, in pixels, rather than a square the shader
 * stretches. That is the whole point of doing it this way: one batch holds every cell already in
 * place, so a layer is one draw and one placement instead of one of each per cell.
 */
const writeCell = (
    out: Float32Array,
    at: number,
    column: number,
    row: number,
    cell: number,
    frame: TAtlasFrame,
    inset: { u: number; v: number },
): number => {
    const x0 = column * cell;
    const y0 = row * cell;
    const x1 = x0 + cell;
    const y1 = y0 + cell;

    // Half a texel in from the tile's own square in the sheet. Tiles sit against each other there
    // with nothing between them, so a cell drawn at a fractional position (a camera that follows
    // with a little lag is enough) asks for a point exactly on the boundary between two columns of
    // the image and gets the tile next door: a one-pixel seam along the edge of every cell.
    //
    // Done here rather than in the shader, which is where the sprites do it, because a tile's
    // square is known when the corners are built and a sprite's is not: this costs nothing per
    // frame, and the shader would have needed four more numbers on every corner.
    const u0 = frame.uvOffset.x + inset.u;
    const v0 = frame.uvOffset.y + inset.v;
    // Guarded against crossing over for a sheet so small that a tile is thinner than one texel.
    const u1 = Math.max(u0, frame.uvOffset.x + frame.uvScale.x - inset.u);
    const v1 = Math.max(v0, frame.uvOffset.y + frame.uvScale.y - inset.v);

    // A list of triangles and not a strip: a strip cannot start a new cell without wasted corners,
    // and at a few thousand cells two more each are cheaper than the bookkeeping. Which way round
    // they are does not matter, since nothing is being hidden from behind.
    out.set([
        x0, y0, u0, v0,
        x1, y0, u1, v0,
        x0, y1, u0, v1,

        x1, y0, u1, v0,
        x1, y1, u1, v1,
        x0, y1, u0, v1,
    ], at);
    return at + FLOATS_PER_CELL;
};

/**
 * Which frame a cycling tile is showing right now, or `null` when its run is not in the sheet.
 */
const animatedFrame = (map: TTilemap, run: string): number | null => {
    const clip = map.atlas?.sequences[run];
    if (clip === undefined || clip.frames.length === 0) {
        return null;
    }
    const clock = map.clocks.get(run);
    return clip.frames[(clock?.frame ?? 0) % clip.frames.length];
};

/**
 * Turns a layer's cells into corners: the still ones and the cycling ones apart.
 *
 * Apart because they are rebuilt at different times. The still batch changes when a tile changes,
 * which is rare; the cycling one changes whenever a torch flickers, which is several times a second.
 * Building them together would mean sending a whole level's worth of corners up again to move four
 * torches.
 *
 * Cells whose id is `0`, whose tile is not in the table, or whose frame is not in the sheet write
 * nothing: an empty cell and a broken one both come out as a hole rather than as an error, because a
 * map is content and a game should still run.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildLayerMesh = (map: TTilemap, layer: TTilemapLayer): { still: Float32Array; moving: Float32Array } => {
    const sheet = map.atlas;
    if (sheet === null || sheet.status !== 'ready') {
        return { still: new Float32Array(0), moving: new Float32Array(0) };
    }
    // With its cut, when the file gives one: a sheet with a margin or a packed one is not a plain grid.
    const atlas: TSpriteAtlas = {
        texture: sheet.texture, columns: sheet.columns, rows: sheet.rows, frames: sheet.frames,
        ...(sheet.rects !== undefined ? { rects: sheet.rects } : {}),
    };
    // Worked out once for the whole layer: every cell reads from the same sheet.
    const inset = {
        u: sheet.texture.width > 0 ? 0.5 / sheet.texture.width : 0,
        v: sheet.texture.height > 0 ? 0.5 / sheet.texture.height : 0,
    };

    // Counted first so each batch is written into one array of the right size: growing as it goes
    // would mean copying a level's worth of numbers several times per rebuild.
    let stillCells = 0;
    let movingCells = 0;
    for (const id of layer.data) {
        if (id === 0) {
            continue;
        }
        const tile = map.tiles[id];
        if (tile === undefined) {
            continue;
        }
        if (tile.anim !== undefined) {
            movingCells++;
        } else {
            stillCells++;
        }
    }

    const still = new Float32Array(stillCells * FLOATS_PER_CELL);
    const moving = new Float32Array(movingCells * FLOATS_PER_CELL);
    let stillAt = 0;
    let movingAt = 0;

    for (let i = 0; i < layer.data.length; i++) {
        const id = layer.data[i];
        if (id === 0) {
            continue;
        }
        const tile = map.tiles[id];
        if (tile === undefined) {
            continue;
        }

        // A name is looked up on the sheet; one the sheet does not have draws nothing, like a number
        // past its end.
        const index = tile.anim !== undefined
            ? animatedFrame(map, tile.anim)
            : typeof tile.frame === 'string' ? sheet.names?.[tile.frame] ?? null : tile.frame ?? null;
        if (index === null || index < 0 || index >= atlas.frames) {
            continue;
        }

        const column = i % map.width;
        const row = Math.floor(i / map.width);
        const frame = atlasFrame(atlas, index);
        if (tile.anim !== undefined) {
            movingAt = writeCell(moving, movingAt, column, row, map.cell, frame, inset);
        } else {
            stillAt = writeCell(still, stillAt, column, row, map.cell, frame, inset);
        }
    }

    // A tile whose frame was out of the sheet left a gap, so what was written can be shorter than
    // what was counted.
    return {
        still: stillAt === still.length ? still : still.subarray(0, stillAt),
        moving: movingAt === moving.length ? moving : moving.subarray(0, movingAt),
    };
};

