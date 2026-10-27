import { DEFAULT_FONT_SIZE } from './layout_font_text';
import { textLines } from './wrap_line';
import type { TParsedFont } from '../../loaders/font/sfnt/parse_font';
import type { TTextStyle } from './types/t_text_style';

/**
 * One line set straight from a vector font's outlines: what it says, each letter's glyph and where
 * its pen is from the line's left edge, and how wide it is.
 *
 * @internal
 */
export type TOutlineLine = { text: string; glyphs: Array<{ glyph: number; pen: number }>; width: number };

/**
 * A text set straight from a vector font, without drawing a letter into its atlas: its lines, the
 * block's size, how tall a line is, where the baseline sits in it, and screen pixels per font unit.
 *
 * @internal
 */
export type TOutlineLayout = { lines: TOutlineLine[]; width: number; height: number; lineHeight: number; baseline: number; units: number };

/**
 * Sets a text in a vector font from the font as it was read, by the same rules and the same numbers
 * as `layoutFontText`, so what is drawn into a picture or measured lines up with a text on screen.
 * Where `layoutFontText` places letters drawn into the atlas, this only reads the font, so it can
 * measure a text, or draw one into pixels, without adding a letter to the atlas.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const layoutOutlineText = (text: string, style: TTextStyle, parsed: TParsedFont): TOutlineLayout => {
    const fontSize = style.fontSize ?? DEFAULT_FONT_SIZE;
    const units = fontSize / parsed.unitsPerEm;
    const letterSpacing = style.letterSpacing ?? 0;
    const lineSpacing = style.lineSpacing ?? 0;
    const lineHeight = (parsed.ascender - parsed.descender + parsed.lineGap) * units;
    const baseline = (parsed.ascender + parsed.lineGap / 2) * units;
    const glyphOf = (char: string): number => parsed.glyphIndex(char.codePointAt(0) ?? 0);

    const step = (char: string, previous: string | undefined): number => {
        const glyph = glyphOf(char);
        const kerning = previous !== undefined ? parsed.kerning(glyphOf(previous), glyph) : 0;
        return (kerning + parsed.advance(glyph)) * units + letterSpacing;
    };

    const lines = textLines(text, style, step, letterSpacing).map((line): TOutlineLine => {
        const glyphs: TOutlineLine['glyphs'] = [];
        let pen = 0;
        let previous = -1;
        for (const char of line) {
            const glyph = glyphOf(char);
            if (previous >= 0) {
                pen += parsed.kerning(previous, glyph) * units;
            }
            glyphs.push({ glyph, pen });
            pen += parsed.advance(glyph) * units + letterSpacing;
            previous = glyph;
        }
        return { text: line, glyphs, width: glyphs.length > 0 ? pen - letterSpacing : 0 };
    });

    const width = Math.max(style.maxWidth ?? 0, ...lines.map((line) => line.width));
    const height = lines.length * lineHeight + (lines.length - 1) * lineSpacing;
    return { lines, width, height, lineHeight, baseline, units };
};
