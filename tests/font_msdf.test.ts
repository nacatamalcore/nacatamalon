import { describe, expect, it } from 'bun:test';
import { MSDF_RANGE, generateMsdf } from '../src/loaders/font/msdf/generate_msdf';
import { colorEdges } from '../src/loaders/font/msdf/color_edges';
import { edgeOf, WHITE } from '../src/loaders/font/msdf/edges';
import { parseFont } from '../src/loaders/font/sfnt/parse_font';
import { buildTtf, TEST_TTF_SPEC } from './helpers/test_ttf';
import type { TGlyphField } from '../src/loaders/font/msdf/generate_msdf';
import type { TOutline } from '../src/loaders/font/sfnt/t_outline';

const font = parseFont(buildTtf(TEST_TTF_SPEC));
// 32 atlas pixels for the 1000-unit em.
const SCALE = 32 / 1000;

/**
 * The median of the three channels at a point given in font units, from 0 to 1.
 */
const valueAt = (field: TGlyphField, x: number, y: number): number => {
    const column = Math.floor(x * SCALE - field.left);
    const row = Math.floor(field.top - y * SCALE);
    const at = (row * field.width + column) * 4;
    const [r, g, b] = [field.data[at]!, field.data[at + 1]!, field.data[at + 2]!];
    return Math.max(Math.min(r, g), Math.min(Math.max(r, g), b)) / 255;
};

const square = (reverse = false): TOutline => {
    const points = [[100, 0], [100, 700], [500, 700], [500, 0]];
    const ordered = reverse ? [...points].reverse() : points;
    return [ordered.map(([x0, y0], i) => {
        const [x1, y1] = ordered[(i + 1) % 4]!;
        return { kind: 'line' as const, x0: x0!, y0: y0!, x1: x1!, y1: y1! };
    })];
};

describe('generateMsdf', () => {
    it('is above the middle inside, below it outside, and pads by the range', () => {
        const field = generateMsdf(square(), SCALE)!;
        expect(valueAt(field, 300, 350)).toBe(1);
        expect(valueAt(field, 50, 350)).toBeLessThan(0.5);
        expect(valueAt(field, 300, 750)).toBeLessThan(0.5);
        // 400 x 700 units is 12.8 x 22.4 pixels, plus the padding either side.
        expect(field.width).toBeGreaterThanOrEqual(13 + MSDF_RANGE);
        expect(field.height).toBeGreaterThanOrEqual(23 + MSDF_RANGE);
        expect(field.left).toBeLessThan(100 * SCALE);
        expect(field.top).toBeGreaterThan(700 * SCALE);
    });

    it('measures distance: half a pixel in reads just above the middle', () => {
        const field = generateMsdf(square(), SCALE)!;
        // A pixel centre half a pixel inside the left edge, on a straight stretch.
        const x = (Math.floor(100 * SCALE) + 0.5) / SCALE;
        const expected = 0.5 + ((x - 100) * SCALE) / MSDF_RANGE;
        expect(valueAt(field, x, 350)).toBeCloseTo(expected, 1);
    });

    it('keeps the corners square: every channel but one says inside near a corner', () => {
        const field = generateMsdf(square(), SCALE)!;
        // Just outside the top-right corner, diagonally: the median says outside.
        expect(valueAt(field, 530, 730)).toBeLessThan(0.5);
        // Just inside it: inside.
        expect(valueAt(field, 480, 680)).toBeGreaterThan(0.5);
    });

    it('treats a loop drawn the wrong way round the same', () => {
        const field = generateMsdf(square(true), SCALE)!;
        expect(valueAt(field, 300, 350)).toBe(1);
        expect(valueAt(field, 50, 350)).toBeLessThan(0.5);
    });

    it('leaves a hole outside', () => {
        const field = generateMsdf(font.outline(3), SCALE)!;
        expect(valueAt(field, 350, 350)).toBeLessThan(0.5);
        expect(valueAt(field, 120, 350)).toBeGreaterThan(0.5);
    });

    it('draws curves and built glyphs', () => {
        const triangle = generateMsdf(font.outline(2), SCALE)!;
        expect(valueAt(triangle, 350, 200)).toBeGreaterThan(0.5);
        expect(valueAt(triangle, 50, 600)).toBeLessThan(0.5);
        const accented = generateMsdf(font.outline(4), SCALE)!;
        expect(valueAt(accented, 300, 300)).toBeGreaterThan(0.5);
        expect(valueAt(accented, 175, 890)).toBeGreaterThan(0.5);
        expect(valueAt(accented, 300, 760)).toBeLessThan(0.5);
    });

    it('gives nothing for a glyph with no outline', () => {
        expect(generateMsdf([], SCALE)).toBeNull();
    });
});

describe('colorEdges', () => {
    it('leaves a loop with no corners white', () => {
        const loop = font.outline(3)[0]!.map((s) => edgeOf(s));
        expect(colorEdges(loop).every((edge) => edge.color === WHITE)).toBe(true);
    });

    it('never gives two edges meeting at a corner the same colours', () => {
        const loop = colorEdges(square()[0]!.map((s) => edgeOf(s)));
        loop.forEach((edge, i) => {
            const next = loop[(i + 1) % loop.length]!;
            expect(edge.color).not.toBe(next.color);
            // And each shares at least one channel with the next, which is what joins them up.
            expect(edge.color & next.color).not.toBe(0);
        });
    });

    it('cuts a loop with one corner and too few edges into enough to colour', () => {
        // A teardrop of two curves meeting at one sharp point and one smooth one.
        const teardrop: TOutline = [[
            { kind: 'quad', x0: 0, y0: 0, cx: -400, cy: 800, x1: 0, y1: 800 },
            { kind: 'quad', x0: 0, y0: 800, cx: 400, cy: 800, x1: 0, y1: 0 },
        ]];
        const edges = colorEdges(teardrop[0]!.map((s) => edgeOf(s)));
        expect(edges.length).toBeGreaterThanOrEqual(3);
        expect(new Set(edges.map((e) => e.color)).size).toBe(3);
    });
});
