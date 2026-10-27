import { textLines } from './wrap_line';
import type { TBitmapFontGlyph, TBitmapFontMeta } from '../../loaders';
import type { TTextStyle } from './types/t_text_style';

/**
 * One character placed inside its text's block, in pixels from the block's top-left corner.
 *
 * @internal
 */
export type TGlyphPlacement = {
    x: number;
    y: number;
    width: number;
    height: number;
    /**
     * Where the character's picture is in the font's image, in pixels of the image.
     */
    source: { x: number; y: number; width: number; height: number };
};

/**
 * Where every character of a text goes, how big the whole block is, and the lines it was set in:
 * one per `\n`, and more where `maxWidth` broke one, without the spaces it broke at.
 *
 * @internal
 */
export type TTextLayout = { width: number; height: number; scale: number; placements: TGlyphPlacement[]; lines: string[] };

/**
 * A text with nothing to lay out yet, because its font has not loaded.
 *
 * @internal
 */
export const EMPTY_LAYOUT: TTextLayout = { width: 0, height: 0, scale: 1, placements: [], lines: [] };

/**
 * One line of a text, laid out from the left edge: what it says, its characters and how wide it is.
 *
 * @internal
 */
export type TTextLine = { text: string; width: number; placements: TGlyphPlacement[] };

/**
 * Puts the lines together into one block: each moved along by `align` inside `maxWidth`, or inside
 * the width of the longest line without one, and the block's size worked out. Shared by every kind
 * of font, so they all align alike.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const alignLines = (lines: readonly TTextLine[], style: TTextStyle, lineHeight: number, scale: number): TTextLayout => {
    const lineSpacing = style.lineSpacing ?? 0;
    // A word too wide for the box on its own still makes the block as wide as it is.
    const width = Math.max(style.maxWidth ?? 0, ...lines.map((line) => line.width));
    const height = lines.length * lineHeight + (lines.length - 1) * lineSpacing;

    const align = style.align ?? 'left';
    const placements: TGlyphPlacement[] = [];
    for (const line of lines) {
        const offset = align === 'center' ? (width - line.width) / 2 : align === 'right' ? width - line.width : 0;
        for (const placement of line.placements) {
            placement.x += offset;
            placements.push(placement);
        }
    }

    return { width, height, scale, placements, lines: lines.map((line) => line.text) };
};

/**
 * The glyph to draw for a character: its own, or its capital when the font has only capitals (most
 * arcade fonts do). `undefined` when the font has neither.
 */
const glyphFor = (char: string, glyphs: ReadonlyMap<string, TBitmapFontGlyph>): TBitmapFontGlyph | undefined => {
    const own = glyphs.get(char);
    if (own !== undefined) {
        return own;
    }
    const capital = char.toUpperCase();
    return capital !== char ? glyphs.get(capital) : undefined;
};

/**
 * Sets a text: where each character goes inside the block, and the block's size. Nothing about
 * where the block is on screen, its turn or its scale: that is applied afterwards, to the whole.
 *
 * Pure on purpose: the same string, style and font always give the same answer, so the rules of
 * setting text are tested here without a renderer, and any backend draws exactly these positions.
 *
 * - The size factor is `fontSize / glyphHeight`: one line is `fontSize` pixels tall.
 * - A character advances by its width plus the font's `tracking`, both scaled, plus `letterSpacing`
 *   in final pixels. The last character of a line adds no spacing after it.
 * - A character the font lacks leaves the gap of a space (the font's own space, or half its height)
 *   and is not drawn.
 * - `\n` starts a line `fontSize + lineSpacing` further down, and so does a line running past
 *   `maxWidth`, broken at a space (`wrapLine`). `align` places each line inside `maxWidth`, or
 *   inside the width of the longest one without it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const layoutText = (text: string, style: TTextStyle, meta: TBitmapFontMeta | null, glyphs: ReadonlyMap<string, TBitmapFontGlyph>): TTextLayout => {
    if (meta === null) {
        return EMPTY_LAYOUT;
    }

    const lineHeight = style.fontSize ?? meta.glyphHeight;
    const scale = lineHeight / meta.glyphHeight;
    const letterSpacing = style.letterSpacing ?? 0;
    const lineSpacing = style.lineSpacing ?? 0;
    const gap = (meta.tracking * scale) + letterSpacing;
    const spaceWidth = glyphs.get(' ')?.w ?? Math.ceil(meta.glyphHeight / 2);
    const step = (char: string): number => (glyphFor(char, glyphs)?.w ?? spaceWidth) * scale + gap;

    const lines = textLines(text, style, step, gap).map((line, row) => {
        const top = row * (lineHeight + lineSpacing);
        const placements: TGlyphPlacement[] = [];
        let pen = 0;
        let count = 0;

        for (const char of line) {
            const glyph = glyphFor(char, glyphs);
            if (glyph !== undefined) {
                placements.push({
                    x: pen,
                    y: top,
                    width: glyph.w * scale,
                    height: lineHeight,
                    source: { x: glyph.x, y: glyph.y, width: glyph.w, height: meta.glyphHeight },
                });
            }
            pen += step(char);
            count++;
        }

        // The spacing is between characters, so the last one's is taken back off.
        const width = count > 0 ? pen - gap : 0;
        return { text: line, width, placements };
    });

    return alignLines(lines, style, lineHeight, scale);
};
