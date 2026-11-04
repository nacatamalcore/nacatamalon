import { describe, expect, it } from 'bun:test';
import { getColor } from '../src/color';
import { createPixels, mirrorPixels, outlinePixels, pixelsFromRows } from '../src/pixels';
import type { TPixelRegion, TPixels } from '../src/pixels';

/**
 * The two small passes that turn shapes with a colour into pixel art: a border around them, and half
 * of something symmetric copied onto the other half.
 */

const PALETTE = { r: '#ff0000', g: '#00ff00', b: '#0000ff', k: '#000000' };
const BLACK = getColor('#000000');

/** The picture as rows again, to read a result as it was written. */
const rowsOf = (pixels: TPixels): string[] => {
    const names = new Map([['255,0,0,255', 'r'], ['0,255,0,255', 'g'], ['0,0,255,255', 'b'], ['0,0,0,255', 'k'], ['0,0,0,0', '.']]);
    return Array.from({ length: pixels.height }, (_, y) => Array.from({ length: pixels.width }, (_, x) => {
        const at = (y * pixels.width + x) * 4;
        return names.get(Array.from(pixels.data.subarray(at, at + 4)).join(',')) ?? '?';
    }).join(''));
};

const draw = (rows: string[]): TPixels => pixelsFromRows(rows, PALETTE);

describe('outlinePixels', () => {
    it('draws a border on the pixels beside the shape, not the corners', () => {
        expect(rowsOf(outlinePixels(draw(['.....', '.....', '..r..', '.....', '.....']), BLACK))).toEqual([
            '.....',
            '..k..',
            '.krk.',
            '..k..',
            '.....',
        ]);
    });

    it('fills the corners when asked', () => {
        expect(rowsOf(outlinePixels(draw(['.....', '..r..', '.....']), BLACK, { corners: true }))).toEqual([
            '.kkk.',
            '.krk.',
            '.kkk.',
        ]);
    });

    it('never outlines its own border', () => {
        const once = rowsOf(outlinePixels(draw(['...', '.r.', '...']), BLACK));
        expect(once).toEqual(['.k.', 'krk', '.k.']);
    });

    it('stays on the picture when the shape touches its edge, and leaves the shape as it was', () => {
        expect(rowsOf(outlinePixels(draw(['rg.', '...']), BLACK))).toEqual(['rgk', 'kk.']);
    });

    it('fills a hole inside the shape from every side', () => {
        expect(rowsOf(outlinePixels(draw(['rrr', 'r.r', 'rrr']), BLACK))).toEqual(['rrr', 'rkr', 'rrr']);
    });

    it('counts a see-through pixel as part of the shape', () => {
        const pixels = createPixels(3, 1);
        pixels.data.set([255, 0, 0, 1], 4);

        outlinePixels(pixels, BLACK);

        expect(Array.from(pixels.data)).toEqual([0, 0, 0, 255, 255, 0, 0, 1, 0, 0, 0, 255]);
    });

    it('looks at a region as if it were the whole picture, so frames of a sheet stay apart', () => {
        // Two frames of two columns: the art of the second is right against the first.
        const pixels = pixelsFromRows(['..r.', '....'], PALETTE);

        outlinePixels(pixels, BLACK, { region: { x: 0, y: 0, width: 2, height: 2 } });
        expect(rowsOf(pixels)).toEqual(['..r.', '....']);

        // And the other way round: it paints only inside its own frame.
        outlinePixels(pixels, BLACK, { region: { x: 2, y: 0, width: 2, height: 2 } });
        expect(rowsOf(pixels)).toEqual(['..rk', '..k.']);
    });

    it('cuts a region to the picture, and does nothing with one off it or of no number', () => {
        const regions: TPixelRegion[] = [
            { x: 5, y: 0, width: 2, height: 2 },
            { x: 0, y: 0, width: 0, height: 2 },
            { x: Number.NaN, y: 0, width: 2, height: 2 },
            { x: 0, y: 0, width: Number.NaN, height: 2 },
        ];
        for (const region of regions) {
            expect(rowsOf(outlinePixels(draw(['r.', '..']), BLACK, { region }))).toEqual(['r.', '..']);
        }
        expect(rowsOf(outlinePixels(draw(['r.', '..']), BLACK, { region: { x: -3, y: -3, width: 30, height: 30 } }))).toEqual(['rk', 'k.']);
    });

    it('gives back the same picture', () => {
        const pixels = createPixels(1, 1);
        expect(outlinePixels(pixels, BLACK)).toBe(pixels);
        expect(mirrorPixels(pixels, 'x')).toBe(pixels);
    });
});

describe('mirrorPixels', () => {
    it('copies the left half onto the right, and leaves the middle of an odd width', () => {
        expect(rowsOf(mirrorPixels(draw(['rg...', 'bkg..']), 'x'))).toEqual(['rg.gr', 'bkgkb']);
    });

    it('copies the top half onto the bottom', () => {
        expect(rowsOf(mirrorPixels(draw(['rg', 'bk', '..', 'gg', 'gg']), 'y'))).toEqual(['rg', 'bk', '..', 'bk', 'rg']);
    });

    it('splits an even size down the middle', () => {
        expect(rowsOf(mirrorPixels(draw(['rg..']), 'x'))).toEqual(['rggr']);
    });

    it('replaces what was on the other half, nothing included', () => {
        expect(rowsOf(mirrorPixels(draw(['.g', '.g']), 'x'))).toEqual(['..', '..']);
    });

    it('mirrors a region about its own middle, and touches nothing else', () => {
        expect(rowsOf(mirrorPixels(draw(['grg..g', 'kbk..k']), 'x', { region: { x: 1, y: 0, width: 4, height: 1 } }))).toEqual(['grggrg', 'kbk..k']);
    });

    it('mirrors about the middle of what is left of a region cut by the edge', () => {
        expect(rowsOf(mirrorPixels(draw(['rg..']), 'x', { region: { x: -2, y: 0, width: 6, height: 1 } }))).toEqual(['rggr']);
    });

    it('cuts a region on its right and on the bottom too', () => {
        expect(rowsOf(mirrorPixels(draw(['rg..']), 'x', { region: { x: 0, y: 0, width: 9, height: 1 } }))).toEqual(['rggr']);
        expect(rowsOf(mirrorPixels(draw(['r', 'g', '.', '.']), 'y', { region: { x: 0, y: 0, width: 1, height: 9 } }))).toEqual(['r', 'g', 'g', 'r']);
        expect(rowsOf(mirrorPixels(draw(['r', 'g', '.', '.']), 'y', { region: { x: 0, y: -2, width: 1, height: 6 } }))).toEqual(['r', 'g', 'g', 'r']);
    });

    it('does nothing with a region off the picture or of no number', () => {
        for (const region of [{ x: 9, y: 0, width: 2, height: 1 }, { x: Number.NaN, y: 0, width: 2, height: 1 }]) {
            expect(rowsOf(mirrorPixels(draw(['r.']), 'x', { region }))).toEqual(['r.']);
            expect(rowsOf(mirrorPixels(draw(['r.']), 'y', { region }))).toEqual(['r.']);
        }
    });

    it('refuses an axis it does not know, and says which it does', () => {
        expect(() => mirrorPixels(createPixels(1, 1), 'z' as never)).toThrow("the axis is 'z'. Use 'x'");
    });
});
