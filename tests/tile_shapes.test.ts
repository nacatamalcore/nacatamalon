import { describe, expect, it } from 'bun:test';
import { tileShapes } from '../src/physics/rapier2d/tile_shapes';
import type { TTilemap } from '../src/gameobjects/tilemap/types/t_tilemap';

/**
 * A map turned into what a simulation collides with, before any simulation: walls joined into large
 * rectangles, ledges along their rows, and one outline per slope.
 */

const TILES = {
    1: { frame: 0, solid: true },
    2: { frame: 0, oneWay: true },
    3: { frame: 0, slope: [0, 1] as [number, number] },
    4: { frame: 0, slope: [0.5, 0.5] as [number, number] },
    5: { frame: 0 },
};

/**
 * A map drawn as text, one character a cell: `#` a wall, `-` a ledge, `/` a slope up to the right,
 * `=` a half-height step, `.` a tile that is nothing, and a space for an empty cell.
 */
const mapOf = (rows: string[], extra: string[] = []): TTilemap => {
    const ids: Record<string, number> = { '#': 1, '-': 2, '/': 3, '=': 4, '.': 5, ' ': 0 };
    const layer = (lines: string[]) => ({ data: lines.join('').split('').map((c) => ids[c]) });
    return {
        cell: 8,
        width: rows[0].length,
        height: rows.length,
        tiles: TILES,
        layers: extra.length > 0 ? [layer(rows), layer(extra)] : [layer(rows)],
    } as unknown as TTilemap;
};

describe('the shapes of a map', () => {
    it('joins a floor into one rectangle, and a wall standing on it into another', () => {
        const { solids } = tileShapes(mapOf([
            '    #',
            '    #',
            '#####',
        ]));

        expect(solids).toEqual([
            { x: 32, y: 0, width: 8, height: 16 },
            { x: 0, y: 16, width: 40, height: 8 },
        ]);
    });

    it('carries a block down while the rows below it are the same', () => {
        const { solids } = tileShapes(mapOf([
            ' ## ',
            ' ## ',
            ' ## ',
        ]));

        expect(solids).toEqual([{ x: 8, y: 0, width: 16, height: 24 }]);
    });

    it('lays ledges out along their rows, apart from the walls', () => {
        const { solids, oneWays } = tileShapes(mapOf([
            '--- --',
            '######',
        ]));

        expect(oneWays).toEqual([
            { x: 0, y: 0, width: 24, height: 8 },
            { x: 32, y: 0, width: 16, height: 8 },
        ]);
        expect(solids).toHaveLength(1);
    });

    it('outlines each slope: a triangle for one that starts at the bottom, four corners for one that does not', () => {
        const { slopes } = tileShapes(mapOf(['/=']));

        expect(slopes).toEqual([
            [[0, 8], [8, 0], [8, 8]],
            [[8, 8], [8, 4], [16, 4], [16, 8]],
        ]);
    });

    it('takes a wall painted on any layer as a wall, over a ledge painted under it', () => {
        const { solids, oneWays } = tileShapes(mapOf(['--'], ['# ']));

        expect(solids).toEqual([{ x: 0, y: 0, width: 8, height: 8 }]);
        expect(oneWays).toEqual([{ x: 8, y: 0, width: 8, height: 8 }]);
    });

    it('builds nothing for tiles that are only pictures', () => {
        expect(tileShapes(mapOf(['..  ..']))).toEqual({ solids: [], oneWays: [], slopes: [] });
    });
});
