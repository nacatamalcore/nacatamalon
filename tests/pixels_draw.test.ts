import { describe, expect, it } from 'bun:test';
import {
    blitPixels, createPixels, drawCircle, drawEllipse, drawLine, fillChecker, fillCircle, fillEllipse, fillGradient, fillNoise, fillRect,
    getPixel, mapPixels, setPixel,
} from '../src/pixels';
import { BAYER_4X4 } from '../src/pixels/bayer';
import { BAYER_WGSL } from '../src/post/builtin/bayer';
import type { TColor } from '../src/color';
import type { TPixels } from '../src/pixels';

/**
 * Painting in memory: the exact pixels each function gives.
 *
 * Exact and not roughly, because the point of painting in code is that the same calls make the same
 * picture everywhere: in a browser, on the native runtime and here. A circle one pixel different on
 * one of them would be a game that looks different on each.
 */

const RED: TColor = { r: 1, g: 0, b: 0, a: 1 };
const BLUE: TColor = { r: 0, g: 0, b: 1, a: 1 };
const CLEAR: TColor = { r: 0, g: 0, b: 0, a: 0 };

const bytes = (pixels: TPixels, x: number, y: number): number[] => {
    const at = (y * pixels.width + x) * 4;
    return [...pixels.data.slice(at, at + 4)];
};

/**
 * The picture as rows of characters: `#` where a pixel is opaque, `.` where it is not.
 */
const shape = (pixels: TPixels): string[] => {
    const rows: string[] = [];
    for (let y = 0; y < pixels.height; y++) {
        let row = '';
        for (let x = 0; x < pixels.width; x++) row += pixels.data[(y * pixels.width + x) * 4 + 3]! > 0 ? '#' : '.';
        rows.push(row);
    }
    return rows;
};

describe('a picture', () => {
    it('starts transparent, or all of one colour', () => {
        expect(bytes(createPixels(2, 2), 1, 1)).toEqual([0, 0, 0, 0]);
        expect(bytes(createPixels(2, 2, RED), 1, 1)).toEqual([255, 0, 0, 255]);
        expect(createPixels(3.9, 2.2).data).toHaveLength(3 * 2 * 4);
    });

    it('refuses a size with nothing in it', () => {
        expect(() => createPixels(0, 4)).toThrow(/at least 1/);
        expect(() => createPixels(Number.NaN, 4)).toThrow(/at least 1/);
    });

    it('sets and reads one pixel, and ignores the outside', () => {
        const p = createPixels(4, 4);
        setPixel(p, 1, 2, RED);
        setPixel(p, -1, 0, RED);
        setPixel(p, 4, 0, RED);

        expect(getPixel(p, 1, 2)).toEqual(RED);
        expect(getPixel(p, 9, 9)).toEqual(CLEAR);
        expect(shape(p).join('')).toBe('.........#......');
    });
});

describe('drawing', () => {
    it('fills a rectangle cut to the edges', () => {
        const p = fillRect(createPixels(4, 3), -1, 1, 3, 5, RED);
        expect(shape(p)).toEqual(['....', '##..', '##..']);
    });

    it('draws the same line every time, one pixel thick', () => {
        const p = drawLine(createPixels(5, 3), 0, 0, 4, 2, RED);
        expect(shape(p)).toEqual(['#....', '.##..', '...##']);
        // Backwards gives the same pixels.
        expect(shape(drawLine(createPixels(5, 3), 4, 2, 0, 0, RED))).toEqual(shape(p));
    });

    it('fills a small circle round, not as a diamond or a square', () => {
        expect(shape(fillCircle(createPixels(3, 3), 1, 1, 1, RED))).toEqual(['.#.', '###', '.#.']);
        expect(shape(fillCircle(createPixels(5, 5), 2, 2, 2, RED))).toEqual([
            '.###.',
            '#####',
            '#####',
            '#####',
            '.###.',
        ]);
    });

    it('fills exactly up to the outline of the same radius', () => {
        for (const radius of [1, 2, 3, 5, 8]) {
            const size = radius * 2 + 1;
            const filled = shape(fillCircle(createPixels(size, size), radius, radius, radius, RED));
            const outline = shape(drawCircle(createPixels(size, size), radius, radius, radius, RED));
            filled.forEach((row, y) => {
                expect(row.indexOf('#')).toBe(outline[y]!.indexOf('#'));
                expect(row.lastIndexOf('#')).toBe(outline[y]!.lastIndexOf('#'));
            });
        }
    });

    it('draws a circle outline with no gaps', () => {
        expect(shape(drawCircle(createPixels(7, 7), 3, 3, 3, RED))).toEqual([
            '..###..',
            '.#...#.',
            '#.....#',
            '#.....#',
            '#.....#',
            '.#...#.',
            '..###..',
        ]);
    });

    it('draws an ellipse outline with no gaps', () => {
        expect(shape(drawEllipse(createPixels(9, 5), 4, 2, 4, 2, RED))).toEqual([
            '..#####..',
            '.#.....#.',
            '#.......#',
            '.#.....#.',
            '..#####..',
        ]);
    });

    it('fills an ellipse exactly up to the outline of the same radii, and keeps it symmetric', () => {
        for (const [rx, ry] of [[4, 2], [2, 4], [7, 3], [1, 5], [6, 1], [10, 6]] as const) {
            const w = rx * 2 + 1;
            const h = ry * 2 + 1;
            const filled = shape(fillEllipse(createPixels(w, h), rx, ry, rx, ry, RED));
            const outline = shape(drawEllipse(createPixels(w, h), rx, ry, rx, ry, RED));
            filled.forEach((row, y) => {
                expect(row.indexOf('#')).toBe(outline[y]!.indexOf('#'));
                expect(row.lastIndexOf('#')).toBe(outline[y]!.lastIndexOf('#'));
                expect(row).toBe([...row].reverse().join(''));
                expect(row).toBe(filled[h - 1 - y]);
            });
            // Touches all four sides of its box, and no row has a hole.
            expect(filled[0]).toContain('#');
            expect(filled.every((row) => row[0] === '#' || row.includes('#'))).toBe(true);
            expect(filled.some((row) => row[0] === '#')).toBe(true);
            outline.forEach((row) => expect(row).toContain('#'));
        }
    });

    it('is the circle when both radii are equal', () => {
        for (const radius of [0, 1, 3, 6]) {
            const size = radius * 2 + 1;
            expect(shape(fillEllipse(createPixels(size, size), radius, radius, radius, radius, RED)))
                .toEqual(shape(fillCircle(createPixels(size, size), radius, radius, radius, RED)));
            expect(shape(drawEllipse(createPixels(size, size), radius, radius, radius, radius, RED)))
                .toEqual(shape(drawCircle(createPixels(size, size), radius, radius, radius, RED)));
        }
    });

    it('turns into a line when one radius is zero, and clips at the edges', () => {
        expect(shape(fillEllipse(createPixels(5, 3), 2, 1, 2, 0, RED))).toEqual(['.....', '#####', '.....']);
        expect(shape(fillEllipse(createPixels(3, 5), 1, 2, 0, 2, RED))).toEqual(['.#.', '.#.', '.#.', '.#.', '.#.']);
        expect(shape(fillEllipse(createPixels(6, 3), 0, 1, 4, 1, RED))).toEqual(['####..', '#####.', '####..']);
    });

    it('cuts a hole when painted transparent, which is what a crater is', () => {
        const p = fillCircle(createPixels(5, 5, RED), 2, 2, 1, CLEAR);
        expect(shape(p)).toEqual(['#####', '##.##', '#...#', '##.##', '#####']);
    });

    it('lays one picture over another, keeping what a transparent pixel leaves', () => {
        const under = createPixels(3, 1, BLUE);
        const over = createPixels(2, 1);
        setPixel(over, 0, 0, RED);

        blitPixels(under, over, 1, 0);
        expect(bytes(under, 1, 0)).toEqual([255, 0, 0, 255]);
        expect(bytes(under, 2, 0)).toEqual([0, 0, 255, 255]);

        blitPixels(under, over, 1, 0, { flipX: true });
        expect(bytes(under, 2, 0)).toEqual([255, 0, 0, 255]);
    });

    it('mixes a half-transparent pixel over what is under it', () => {
        const under = createPixels(1, 1, BLUE);
        blitPixels(under, createPixels(1, 1, { r: 1, g: 0, b: 0, a: 0.5 }), 0, 0);
        expect(bytes(under, 0, 0)).toEqual([128, 0, 127, 255]);
    });

    it('works every pixel out again from its colour and place', () => {
        const p = mapPixels(createPixels(2, 1), (_, x) => (x === 0 ? RED : BLUE));
        expect(bytes(p, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(bytes(p, 1, 0)).toEqual([0, 0, 255, 255]);
    });
});

describe('fills', () => {
    it('runs a gradient from the first colour to the last, top to bottom', () => {
        const p = fillGradient(createPixels(1, 3), { from: RED, to: BLUE });
        expect(bytes(p, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(bytes(p, 0, 1)).toEqual([128, 0, 128, 255]);
        expect(bytes(p, 0, 2)).toEqual([0, 0, 255, 255]);
    });

    it('cuts it into flat bands, and only dithers where two bands meet', () => {
        const flat = fillGradient(createPixels(4, 8), { from: RED, to: BLUE, bands: 2 });
        // Two bands only: every pixel is one of the two colours.
        for (let y = 0; y < 8; y++) {
            expect([[255, 0, 0, 255], [0, 0, 255, 255]]).toContainEqual(bytes(flat, 0, y));
        }

        const dithered = fillGradient(createPixels(4, 16), { from: RED, to: BLUE, bands: 2, dither: true });
        expect(bytes(dithered, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(bytes(dithered, 3, 15)).toEqual([0, 0, 255, 255]);
        // The middle rows mix the two, in the pattern rather than in a line.
        const middle = [0, 1, 2, 3].map((x) => bytes(dithered, x, 8)[0]);
        expect(new Set(middle).size).toBe(2);
    });

    it('takes several colours, evenly spaced', () => {
        const p = fillGradient(createPixels(3, 1), { colors: [RED, BLUE, RED], direction: 'right' });
        expect(bytes(p, 1, 0)).toEqual([0, 0, 255, 255]);
        expect(bytes(p, 2, 0)).toEqual([255, 0, 0, 255]);
    });

    it('asks for two colours', () => {
        expect(() => fillGradient(createPixels(2, 2), { from: RED })).toThrow(/two colours/);
    });

    it('paints the same noise for the same seed, and different noise for another', () => {
        const a = fillNoise(createPixels(16, 16), { seed: 3, scale: 4, octaves: 3 });
        const b = fillNoise(createPixels(16, 16), { seed: 3, scale: 4, octaves: 3 });
        const c = fillNoise(createPixels(16, 16), { seed: 4, scale: 4, octaves: 3 });
        expect(a.data).toEqual(b.data);
        expect(a.data).not.toEqual(c.data);
    });

    it('tiles noise without a seam: the last column runs on into the first', () => {
        const p = fillNoise(createPixels(32, 32), { seed: 9, scale: 8 });
        let worstEdge = 0;
        let worstInside = 0;
        for (let y = 0; y < 32; y++) {
            worstEdge = Math.max(worstEdge, Math.abs(bytes(p, 31, y)[0]! - bytes(p, 0, y)[0]!));
            worstInside = Math.max(worstInside, Math.abs(bytes(p, 15, y)[0]! - bytes(p, 16, y)[0]!));
        }
        // Across the wrap it changes no more than between two neighbours anywhere else.
        expect(worstEdge).toBeLessThanOrEqual(worstInside + 8);
    });

    it('stays between its two colours', () => {
        const p = fillNoise(createPixels(8, 8), { from: { r: 0.2, g: 0.2, b: 0.2, a: 1 }, to: { r: 0.4, g: 0.4, b: 0.4, a: 1 } });
        for (let i = 0; i < p.data.length; i += 4) {
            expect(p.data[i]).toBeGreaterThanOrEqual(51);
            expect(p.data[i]).toBeLessThanOrEqual(102);
        }
    });

    it('lays a checkerboard from the top-left square', () => {
        const p = fillChecker(createPixels(4, 2), 2, RED, BLUE);
        expect(bytes(p, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(bytes(p, 2, 0)).toEqual([0, 0, 255, 255]);
    });
});

describe('the dither pattern', () => {
    it('is one table, shared by a painted gradient and the screen effect', () => {
        const fromShader = [...BAYER_WGSL.matchAll(/(\d+)\.0/g)].map((found) => Number(found[1])).slice(0, 16);
        expect(fromShader).toEqual([...BAYER_4X4]);
    });
});
