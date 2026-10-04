import { describe, expect, it } from 'bun:test';
import { layoutText } from '../src/gameobjects/text/layout_text';
import { TEST_FONT_META } from './helpers/test_font';

const glyphs = new Map(TEST_FONT_META.chars.map((glyph) => [glyph.char, glyph]));
const lay = (text: string, style = {}) => layoutText(text, style, TEST_FONT_META, glyphs);

describe('layoutText', () => {
    it('advances each character by its width plus the font tracking, with none after the last', () => {
        const layout = lay('ABI');

        expect(layout.placements.map((p) => p.x)).toEqual([0, 9, 18]);
        // 8 + 1 + 8 + 1 + 4: the tracking sits between characters, not after the last.
        expect(layout.width).toBe(22);
        expect(layout.height).toBe(8);
    });

    it('scales everything by fontSize over the font height', () => {
        const layout = lay('AB', { fontSize: 24 });

        expect(layout.scale).toBe(3);
        expect(layout.placements.map((p) => [p.x, p.width, p.height])).toEqual([[0, 24, 24], [27, 24, 24]]);
        expect(layout.width).toBe(51);
    });

    it('adds letterSpacing in final pixels, not in font pixels', () => {
        const layout = lay('AB', { fontSize: 16, letterSpacing: 5 });

        // 8 * 2 + 1 * 2 + 5
        expect(layout.placements[1].x).toBe(23);
    });

    it('starts a line lower on every newline, with lineSpacing between lines', () => {
        const layout = lay('AB\nC', { lineSpacing: 3 });

        expect(layout.placements.map((p) => [p.x, p.y])).toEqual([[0, 0], [9, 0], [0, 11]]);
        expect(layout.width).toBe(17);
        expect(layout.height).toBe(19);
    });

    it('aligns every line inside the width of the longest one', () => {
        const centred = lay('ABC\nA', { align: 'center' });
        const right = lay('ABC\nA', { align: 'right' });

        // The block is 26 wide and the short line 8, so 18 are left over.
        expect(centred.placements[3].x).toBe(9);
        expect(right.placements[3].x).toBe(18);
    });

    it('draws a lowercase letter the font lacks with its capital', () => {
        const layout = lay('ab');

        expect(layout.placements.map((p) => p.glyph.char)).toEqual(['A', 'B']);
    });

    it('leaves a space-wide gap for a character the font does not have, and draws nothing there', () => {
        const layout = lay('A?B');

        expect(layout.placements.map((p) => p.glyph.char)).toEqual(['A', 'B']);
        // A (8) + tracking (1) + the space's 6 + tracking (1)
        expect(layout.placements[1].x).toBe(16);
    });

    it('lays out nothing while the font has not arrived', () => {
        expect(layoutText('ABC', {}, null, new Map())).toEqual({ width: 0, height: 0, scale: 1, placements: [] });
    });
});
