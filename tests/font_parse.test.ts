import { describe, expect, it } from 'bun:test';
import { parseFont } from '../src/loaders/font/sfnt/parse_font';
import { buildTtf, toWoff, TEST_TTF_SPEC } from './helpers/test_ttf';
import type { TOutline } from '../src/loaders/font/sfnt/t_outline';

const font = parseFont(buildTtf(TEST_TTF_SPEC));

/**
 * Every point a loop passes through, in order, ignoring control points.
 */
const corners = (outline: TOutline): [number, number][][] => outline.map((loop) => loop.map((s) => [s.x0, s.y0]));

describe('parseFont', () => {
    it('reads the name and the measurements', () => {
        expect(font.name).toBe('Test Sans');
        expect(font.unitsPerEm).toBe(1000);
        expect(font.ascender).toBe(800);
        expect(font.descender).toBe(-200);
        expect(font.lineGap).toBe(0);
    });

    it('maps characters to glyphs, and anything else to the missing glyph', () => {
        expect(font.glyphIndex('I'.codePointAt(0)!)).toBe(1);
        expect(font.glyphIndex('É'.codePointAt(0)!)).toBe(4);
        expect(font.glyphIndex('Z'.codePointAt(0)!)).toBe(0);
        expect(font.glyphIndex(0x1f600)).toBe(0);
    });

    it('reads all three ways of mapping characters', () => {
        for (const extra of [{ cmapFormat: 12 as const }, { rangeOffsets: true }]) {
            const other = parseFont(buildTtf({ ...TEST_TTF_SPEC, ...extra }));
            expect(other.glyphIndex('A'.codePointAt(0)!)).toBe(2);
            expect(other.glyphIndex('O'.codePointAt(0)!)).toBe(3);
            expect(other.glyphIndex('Z'.codePointAt(0)!)).toBe(0);
        }
        const wide = parseFont(buildTtf({ ...TEST_TTF_SPEC, cmapFormat: 12, cmap: { ...TEST_TTF_SPEC.cmap, '😀': 2 } }));
        expect(wide.glyphIndex(0x1f600)).toBe(2);
    });

    it('reads advances', () => {
        expect(font.advance(1)).toBe(600);
        expect(font.advance(5)).toBe(250);
    });

    it('reads a glyph of straight lines as one closed loop', () => {
        const outline = font.outline(2);
        expect(outline).toHaveLength(1);
        expect(outline[0]!.every((s) => s.kind === 'line')).toBe(true);
        expect(corners(outline)).toEqual([[[0, 0], [350, 700], [700, 0]]]);
        // Closed: the last segment ends where the first began.
        expect(outline[0]!.at(-1)).toMatchObject({ x1: 0, y1: 0 });
    });

    it('implies the on-curve points between two control points', () => {
        const [outer, hole] = font.outline(3);
        expect(outer!.every((s) => s.kind === 'quad')).toBe(true);
        expect(outer!.map((s) => [s.x0, s.y0])).toEqual([[0, 350], [350, 700], [700, 350], [350, 0]]);
        expect(hole!.map((s) => [s.x0, s.y0])).toEqual([[250, 250], [450, 250], [450, 450], [250, 450]]);
    });

    it('builds a glyph out of others, moved and scaled', () => {
        const outline = font.outline(4);
        expect(outline).toHaveLength(2);
        expect(corners(outline)[0]).toEqual([[100, 0], [100, 700], [500, 700], [500, 0]]);
        expect(corners(outline)[1]).toEqual([[125, 800], [125, 975], [225, 975], [225, 800]]);
    });

    it('gives a glyph with no outline an empty one', () => {
        expect(font.outline(5)).toEqual([]);
        expect(font.outline(999)).toEqual([]);
    });

    it('reads long glyph offsets', () => {
        const long = parseFont(buildTtf({ ...TEST_TTF_SPEC, longLoca: true }));
        expect(corners(long.outline(2))).toEqual(corners(font.outline(2)));
    });

    it('reads kerning from the old table', () => {
        const kerned = parseFont(buildTtf({ ...TEST_TTF_SPEC, kern: [[2, 3, -40], [1, 1, 15]] }));
        expect(kerned.kerning(2, 3)).toBe(-40);
        expect(kerned.kerning(1, 1)).toBe(15);
        expect(kerned.kerning(3, 2)).toBe(0);
    });

    it('reads kerning from GPOS, both as pairs and as groups, and prefers it to the old table', () => {
        for (const format of [1, 2] as const) {
            const kerned = parseFont(buildTtf({
                ...TEST_TTF_SPEC,
                kern: [[2, 3, -999]],
                gpos: { format, pairs: [[2, 3, -40], [2, 1, -10], [3, 2, 25]] },
            }));
            expect(kerned.kerning(2, 3)).toBe(-40);
            expect(kerned.kerning(2, 1)).toBe(-10);
            expect(kerned.kerning(3, 2)).toBe(25);
            expect(kerned.kerning(1, 2)).toBe(0);
        }
    });

    it('reads a .woff the same as the .ttf inside it', () => {
        const web = parseFont(toWoff(buildTtf(TEST_TTF_SPEC)));
        expect(web.name).toBe('Test Sans');
        expect(web.glyphIndex('O'.codePointAt(0)!)).toBe(3);
        expect(corners(web.outline(3))).toEqual(corners(font.outline(3)));
    });

    it('refuses the kinds of file it does not read, saying why', () => {
        const header = (tag: string): Uint8Array => Uint8Array.from([...tag].map((c) => c.charCodeAt(0)).concat(new Array(40).fill(0)));
        expect(() => parseFont(header('OTTO'))).toThrow(/cubic curves/);
        expect(() => parseFont(header('wOF2'))).toThrow(/woff2/);
        expect(() => parseFont(header('ttcf'))).toThrow(/collection/);
        expect(() => parseFont(header('GIF8'))).toThrow(/not a TrueType font/);
        expect(() => parseFont(new Uint8Array(4))).toThrow(/too short/);
    });
});
