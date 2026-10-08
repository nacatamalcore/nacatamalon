import type { TBitmapFontGlyph, TBitmapFontMeta } from '../../loaders';
import type { TTextStyle } from './types/t_text_style';

/**
 * One character placed inside its text's block, in pixels from the block's top-left corner.
 *
 * @internal
 */
export type TGlyphPlacement = { x: number; y: number; width: number; height: number; glyph: TBitmapFontGlyph };

/**
 * Where every character of a text goes, and how big the whole block is.
 *
 * @internal
 */
export type TTextLayout = { width: number; height: number; scale: number; placements: TGlyphPlacement[] };

const EMPTY: TTextLayout = { width: 0, height: 0, scale: 1, placements: [] };

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
 * - `\n` starts a line `fontSize + lineSpacing` further down. `align` places each line inside the
 *   width of the longest one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const layoutText = (text: string, style: TTextStyle, meta: TBitmapFontMeta | null, glyphs: ReadonlyMap<string, TBitmapFontGlyph>): TTextLayout => {
    if (meta === null) {
        return EMPTY;
    }

    const lineHeight = style.fontSize ?? meta.glyphHeight;
    const scale = lineHeight / meta.glyphHeight;
    const letterSpacing = style.letterSpacing ?? 0;
    const lineSpacing = style.lineSpacing ?? 0;
    const gap = (meta.tracking * scale) + letterSpacing;
    const spaceWidth = glyphs.get(' ')?.w ?? Math.ceil(meta.glyphHeight / 2);

    const lines = text.split('\n').map((line, row) => {
        const top = row * (lineHeight + lineSpacing);
        const placements: TGlyphPlacement[] = [];
        let pen = 0;
        let count = 0;

        for (const char of line) {
            const glyph = glyphFor(char, glyphs);
            if (glyph !== undefined) {
                placements.push({ x: pen, y: top, width: glyph.w * scale, height: lineHeight, glyph });
            }
            pen += (glyph?.w ?? spaceWidth) * scale + gap;
            count++;
        }

        // The spacing is between characters, so the last one's is taken back off.
        const width = count > 0 ? pen - gap : 0;
        return { width, placements };
    });

    const width = Math.max(0, ...lines.map((line) => line.width));
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

    return { width, height, scale, placements };
};
