import type { TSight } from './sight_2d';

/**
 * Where each cell of a map layer's batch starts, so a part of the layer can be drawn on its own.
 *
 * The cells are written row after row, an empty one writing nothing, so `firstVertex[i]` is the
 * corner cell `i` starts at and `firstVertex[i + 1]` the one after its last: a stretch of a row is the
 * corners between the first of its first cell and the first of the cell after its last. One more
 * entry than there are cells, the last being how many corners there are.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTileGrid = {
    readonly columns: number;
    readonly rows: number;
    /** A cell's size in the layer's own pixels. */
    readonly cell: number;
    readonly firstVertex: Uint32Array;
};

/**
 * Filled again by every call: pairs of the first corner and how many, a frame allocating nothing.
 */
const runs: number[] = [];

/**
 * The stretches of a layer's batch to draw so that every cell a camera shows is drawn, and nothing
 * else but the rest of the rows they are in the middle of: what `sight` covers is carried into the
 * layer's own cells (its place, turn and growth undone, as the shader does them), and each row of
 * that is one stretch. Rows seen across their whole width follow on from one another and become one,
 * so a layer seen whole is one draw, as it was.
 *
 * `null` when it cannot say, for a layer grown to nothing or placed nowhere a number can reach: then
 * it is drawn whole, as before. An empty list when none of it is seen.
 *
 * **What comes back is good until the next call**: it is the same list every time.
 *
 * @param place - Where the layer is drawn: `worldOf(layer)`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const tileRuns = (
    grid: TTileGrid,
    place: { readonly x: number; readonly y: number; readonly rotation: number; readonly scaleX: number; readonly scaleY: number },
    sight: TSight,
): readonly number[] | null => {
    if (place.scaleX === 0 || place.scaleY === 0 || grid.cell <= 0 || grid.firstVertex.length !== grid.columns * grid.rows + 1) {
        return null;
    }
    // The four corners of what is seen, in the layer's own pixels: back from where it is, turned
    // back, shrunk back. The rectangle around them is all the layer's cells that can show.
    const c = Math.cos(-place.rotation);
    const s = Math.sin(-place.rotation);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let k = 0; k < 4; k++) {
        const dx = (k & 1 ? sight.maxX : sight.minX) - place.x;
        const dy = (k & 2 ? sight.maxY : sight.minY) - place.y;
        const x = (dx * c - dy * s) / place.scaleX;
        const y = (dx * s + dy * c) / place.scaleY;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minX + maxX + minY + maxY)) {
        return null;
    }

    runs.length = 0;
    const first = Math.max(0, Math.floor(minX / grid.cell));
    const last = Math.min(grid.columns - 1, Math.floor(maxX / grid.cell));
    const top = Math.max(0, Math.floor(minY / grid.cell));
    const bottom = Math.min(grid.rows - 1, Math.floor(maxY / grid.cell));
    if (first > last || top > bottom) {
        return runs;
    }
    const corners = grid.firstVertex;
    for (let row = top; row <= bottom; row++) {
        const from = corners[row * grid.columns + first];
        const to = corners[row * grid.columns + last + 1];
        if (to <= from) {
            continue;
        }
        // Following straight on from the stretch before, it is the same draw.
        const end = runs.length;
        if (end > 0 && runs[end - 2] + runs[end - 1] === from) {
            runs[end - 1] += to - from;
        } else {
            runs.push(from, to - from);
        }
    }
    return runs;
};
