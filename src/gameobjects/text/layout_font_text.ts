import { fontGlyph, fontKerning } from '../../loaders';
import { EMPTY_LAYOUT, alignLines } from './layout_text';
import type { TFont, TFontGlyph } from '../../loaders';
import type { TGlyphPlacement, TTextLayout } from './layout_text';
import type { TTextStyle } from './types/t_text_style';

/**
 * How big a vector font's text is when no `fontSize` is given, in pixels per em.
 *
 * @internal
 */
export const DEFAULT_FONT_SIZE = 16;

/**
 * Sets a text in a vector font: where each character goes inside the block, and the block's size.
 * The same job as `layoutText` does for a bitmap font, by the rules of type rather than of a grid.
 *
 * - `fontSize` is the size of the font in pixels, as anywhere else type is set: a `fontSize` of 16
 *   makes one em 16 pixels. Default 16.
 * - A line is as tall as the font says (its ascender, descender and line gap), and the baseline sits
 *   where the font puts it, half the line gap below the line's top.
 * - A character advances by the font's own advance, adjusted by the font's kerning against the one
 *   before it, plus `letterSpacing`. A line is as wide as its advances.
 * - A character the font lacks is drawn as the font's missing glyph, usually a box.
 * - `\n` starts a line `lineHeight + lineSpacing` further down; `align` works as for a bitmap font.
 *
 * Characters are drawn into the font's atlas the first time they are laid out, which is why this is
 * not quite pure: the same text and style always give the same answer, but the first time may also
 * write to the atlas.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const layoutFontText = (text: string, style: TTextStyle, font: TFont): TTextLayout => {
    const meta = font.meta;
    if (meta === null || font.status !== 'ready') {
        return EMPTY_LAYOUT;
    }

    const fontSize = style.fontSize ?? DEFAULT_FONT_SIZE;
    // Screen pixels per font unit, and per pixel of the atlas.
    const units = fontSize / meta.unitsPerEm;
    const pixels = fontSize / font.size;
    const letterSpacing = style.letterSpacing ?? 0;
    const lineSpacing = style.lineSpacing ?? 0;
    const lineHeight = (meta.ascender - meta.descender + meta.lineGap) * units;
    const baseline = (meta.ascender + meta.lineGap / 2) * units;

    const lines = text.split('\n').map((line, row) => {
        const top = row * (lineHeight + lineSpacing) + baseline;
        const placements: TGlyphPlacement[] = [];
        let pen = 0;
        let count = 0;
        let previous: TFontGlyph | undefined;

        for (const char of line) {
            const glyph = fontGlyph(font, char)!;
            if (previous !== undefined) {
                pen += fontKerning(font, previous, glyph) * units;
            }
            if (glyph.width > 0) {
                placements.push({
                    x: pen + glyph.left * pixels,
                    y: top - glyph.top * pixels,
                    width: glyph.width * pixels,
                    height: glyph.height * pixels,
                    source: { x: glyph.x, y: glyph.y, width: glyph.width, height: glyph.height },
                });
            }
            pen += glyph.advance * units + letterSpacing;
            previous = glyph;
            count++;
        }

        // The spacing is between characters, so the last one's is taken back off.
        const width = count > 0 ? pen - letterSpacing : 0;
        return { width, placements };
    });

    return alignLines(lines, style, lineHeight, pixels);
};
