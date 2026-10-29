import { describe, expect, it } from 'bun:test';
import { tileRuns } from '../src/render/shared/tile_runs';
import type { TTileGrid } from '../src/render/shared/tile_runs';

/**
 * Drawing only the cells of a map layer a camera shows: each row it sees is one stretch of the
 * layer's corners, and rows seen across their whole width are one.
 */

const here = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const sight = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });

/** A layer of `columns` by `rows` cells of 10, each written unless `empty` says so: six corners each. */
const grid = (columns: number, rows: number, empty: (i: number) => boolean = () => false): TTileGrid => {
    const firstVertex = new Uint32Array(columns * rows + 1);
    for (let i = 0; i < columns * rows; i++) {
        firstVertex[i + 1] = firstVertex[i]! + (empty(i) ? 0 : 6);
    }
    return { columns, rows, cell: 10, firstVertex };
};

describe('the cells of a layer a camera shows', () => {
    it('are one stretch for each row seen, from its first cell seen to its last', () => {
        // Columns 1 and 2 of rows 0 and 1, in a layer four across.
        expect(tileRuns(grid(4, 3), here, sight(12, 0, 28, 15))).toEqual([6, 12, 30, 12]);
    });

    it('are one stretch for all of it when the whole layer is seen, as it was drawn before', () => {
        expect(tileRuns(grid(4, 3), here, sight(-50, -50, 500, 500))).toEqual([0, 72]);
        // Whole rows follow on from one another.
        expect(tileRuns(grid(4, 3), here, sight(-1, 11, 41, 25))).toEqual([24, 48]);
    });

    it('are none when none of it is seen', () => {
        expect(tileRuns(grid(4, 3), here, sight(100, 100, 200, 200))).toEqual([]);
        expect(tileRuns(grid(4, 3), here, sight(-90, 0, -10, 20))).toEqual([]);
    });

    it('leave out the empty cells, which wrote nothing, and keep the count right', () => {
        // The second cell of every row is empty: row 0 is cells 0, 2, 3 and has three written.
        const holes = grid(4, 2, (i) => i % 4 === 1);
        expect(tileRuns(holes, here, sight(0, 0, 39, 9))).toEqual([0, 18]);
        // Only the hole seen: nothing to draw.
        expect(tileRuns(holes, here, sight(11, 0, 19, 9))).toEqual([]);
    });

    it('are found where the layer is placed, grown and turned, as the shader places it', () => {
        // Placed at 100 across and grown twice: its column 1 is at 120 to 140 in the world.
        expect(tileRuns(grid(4, 1), { ...here, x: 100, scaleX: 2, scaleY: 2 }, sight(121, 0, 139, 5))).toEqual([6, 6]);
        // A quarter turn: its row runs down the world, so a cell 25 down is its column 2.
        const turned = tileRuns(grid(4, 1), { ...here, rotation: Math.PI / 2 }, sight(-8, 21, -2, 29));
        expect(turned).toEqual([12, 6]);
    });

    it('cannot say for a layer grown to nothing, which is then drawn whole', () => {
        expect(tileRuns(grid(4, 1), { ...here, scaleX: 0 }, sight(0, 0, 10, 10))).toBeNull();
        // Nor for one whose cells were not all noted.
        expect(tileRuns({ ...grid(4, 1), columns: 5 }, here, sight(0, 0, 10, 10))).toBeNull();
    });
});
