import { describe, expect, it } from 'bun:test';
import { layoutText } from '../src/gameobjects/text/layout_text';
import { wrapLine } from '../src/gameobjects/text/wrap_line';
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

        // A and B, by where they are in the font's image.
        expect(layout.placements.map((p) => p.source.x)).toEqual([0, 8]);
    });

    it('leaves a space-wide gap for a character the font does not have, and draws nothing there', () => {
        const layout = lay('A?B');

        // A and B, by where they are in the font's image.
        expect(layout.placements.map((p) => p.source.x)).toEqual([0, 8]);
        // A (8) + tracking (1) + the space's 6 + tracking (1)
        expect(layout.placements[1].x).toBe(16);
    });

    it('lays out nothing while the font has not arrived', () => {
        expect(layoutText('ABC', {}, null, new Map())).toEqual({ width: 0, height: 0, scale: 1, placements: [] });
    });
});

describe('wrapLine', () => {
    // Every character one pixel wide and nothing between them, so a width counts characters.
    const wrap = (line: string, maxWidth: number) => wrapLine(line, maxWidth, () => 1, 0);

    it('puts as many words on a line as fit, and leaves out the spaces it broke at', () => {
        expect(wrap('the quick brown fox', 10)).toEqual(['the quick', 'brown fox']);
        expect(wrap('one  two', 4)).toEqual(['one', 'two']);
    });

    it('lets a space hang past the edge rather than break a line on its own', () => {
        expect(wrap('abc def', 3)).toEqual(['abc', 'def']);
        expect(wrap('abc ', 3)).toEqual(['abc ']);
    });

    it('breaks a word wider than the whole width between two letters', () => {
        expect(wrap('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
        expect(wrap('ab abcdefgh', 4)).toEqual(['ab', 'abcd', 'efgh']);
    });

    it('keeps one character on every line however narrow the width', () => {
        expect(wrap('abc', 0.5)).toEqual(['a', 'b', 'c']);
    });

    it('keeps the spaces a line starts with, which are its indent', () => {
        expect(wrap('  ab cd', 5)).toEqual(['  ab', 'cd']);
    });

    it('leaves a line that fits as it is', () => {
        expect(wrap('ab cd', 5)).toEqual(['ab cd']);
        expect(wrap('', 5)).toEqual(['']);
    });

    it('measures a line from its own first character, with nothing carried over from the one before', () => {
        // A step that costs one more after a letter than at the start of a line, as kerning would.
        const step = (_char: string, previous: string | undefined) => (previous === undefined ? 1 : 2);
        // "ab" is 3 wide, so it fits in 3; measured with what came before it on the first line, 4.
        expect(wrapLine('ab ab', 3, step, 0)).toEqual(['ab', 'ab']);
    });
});

describe('layoutText with a maxWidth', () => {
    it('carries on below with the words that do not fit, from the left edge', () => {
        // "A B" is 8 + 1 + 6 + 1 + 8 = 24 wide; with " C" it would be 40. The test font draws its space.
        const layout = lay('A B C D', { maxWidth: 30 });

        expect(layout.placements.map((p) => [p.x, p.y])).toEqual([[0, 0], [9, 0], [16, 0], [0, 8], [9, 8], [16, 8]]);
        expect(layout.height).toBe(16);
    });

    it('breaks only where it has to, and still at every newline', () => {
        expect(lay('AB\nCD', { maxWidth: 100 }).placements.map((p) => p.y)).toEqual([0, 0, 8, 8]);
        expect(lay('ABCDE', { maxWidth: 20 }).placements.map((p) => [p.x, p.y])).toEqual([[0, 0], [9, 0], [0, 8], [9, 8], [0, 16]]);
    });

    it('is the box the lines are aligned in, and as wide as the block', () => {
        const centred = lay('AB CD', { maxWidth: 40, align: 'center' });
        const right = lay('A', { maxWidth: 40, align: 'right' });

        // Each line is 17 wide, so 23 are left over in the box.
        expect(centred.placements.map((p) => p.x)).toEqual([11.5, 20.5, 11.5, 20.5]);
        expect(centred.width).toBe(40);
        expect(right.placements[0].x).toBe(32);
        expect(right.width).toBe(40);
    });

    it('is still outgrown by a letter wider than it', () => {
        expect(lay('AB', { maxWidth: 3 }).width).toBe(8);
    });

    it('scales with fontSize like everything else measured in final pixels', () => {
        // At 16, "AB" is 34 wide and "AB C" 64.
        const layout = lay('AB C', { fontSize: 16, maxWidth: 40 });

        expect(layout.placements.map((p) => [p.x, p.y])).toEqual([[0, 0], [18, 0], [0, 16]]);
    });

    it('changes nothing when it is 0 or left out', () => {
        expect(lay('AB CD', { maxWidth: 0 })).toEqual(lay('AB CD'));
    });
});
