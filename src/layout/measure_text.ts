import { bitmapFontGlyphs } from '../loaders/bitmap_font/bitmap_font_glyphs';
import { parsedFontOf } from '../loaders/font/font_glyphs';
import { layoutText } from '../gameobjects/text/layout_text';
import { layoutFontText } from '../gameobjects/text/layout_font_text';
import { layoutOutlineText } from '../gameobjects/text/layout_outline_text';
import { builtinFontMeta, isBuiltinFont } from '../gameobjects/text/default_font';
import { looseFontOf } from '../gameobjects/text/loose_font';
import type { TBitmapFont, TBitmapFontGlyph, TFont } from '../loaders';
import type { TTextLayout } from '../gameobjects/text/layout_text';
import type { TText } from '../gameobjects/text/types/t_text';
import type { TTextStyle } from '../gameobjects/text/types/t_text_style';

/**
 * What `measureText` is asked to measure with: a font, and the same size, spacing and width a text
 * on screen takes.
 *
 * @category Layout
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeasureTextOptions = TTextStyle & {
    /**
     * A font from `useLoadFont` or `useLoadBitmapFont`, or the key one was loaded under. A key is
     * looked up in the scene body, where `createText` looks up its own. Left out, the font the
     * engine carries, which needs no game and no loading.
     */
    font?: TBitmapFont | TFont | string;
};

/**
 * How big a text measured by `measureText` is, and the lines it is set in.
 *
 * @category Layout
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTextMeasure = {
    /**
     * How wide the block is: its longest line, or `maxWidth` when there is one.
     */
    width: number;
    /**
     * How tall the block is: its lines and the spacing between them.
     */
    height: number;
    /**
     * What each line says: one per `\n`, and more where `maxWidth` broke one, without the spaces it
     * broke at.
     */
    lines: string[];
};

/**
 * A font still on its way: nothing yet, and a new one each time, so no caller shares its lines.
 */
const nothing = (): TTextMeasure => ({ width: 0, height: 0, lines: [] });

/** The letters of each built-in font by character, made once: a text is measured every frame. */
const builtinGlyphs = new Map<string, Map<string, TBitmapFontGlyph>>();

/**
 * A text on screen laid out with its own font and style, exactly as it is laid out to be drawn, so it
 * is right on the frame it is made. A font the engine carries is laid out before it has loaded: its
 * letters are worked out, not read from the file.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const layoutOfText = (text: TText): TTextLayout => {
    const { font, style } = text;
    if (font.type === 'font') {
        return layoutFontText(text.text, style, font);
    }
    if (font.meta === null && isBuiltinFont(font.key)) {
        const meta = builtinFontMeta(font.key);
        let glyphs = builtinGlyphs.get(font.key);
        if (glyphs === undefined) {
            glyphs = new Map(meta.chars.map((glyph) => [glyph.char, glyph]));
            builtinGlyphs.set(font.key, glyphs);
        }
        return layoutText(text.text, style, meta, glyphs);
    }
    return layoutText(text.text, style, font.meta, bitmapFontGlyphs(font));
};

/**
 * How a text on screen is set: the size of its block and the lines it is in, with its own font and
 * style. The same block `sizeOf` measures, before the text's scale.
 *
 * @param text - A text from `createText`.
 * @returns How wide and tall its block is, and what each line says.
 *
 * @example
 * ```ts
 * const description = createText({ text: 'A rusty key. It opens the door of the old mill.', style: { maxWidth: 160 } });
 * // A panel as tall as the lines the description took.
 * const { lines } = measureText(description);
 * createSprite({ width: 176, height: lines.length * 10 + 8, tint: '#1a2a5a' });
 * ```
 *
 * @category Layout
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export function measureText(text: TText): TTextMeasure;
/**
 * How big a text will be, without making one: the size of its block in pixels and the lines it is
 * set in, exactly as `createText` and `drawText` would set it with the same font and style. What a
 * box needs before its label exists, a title that has to fit a sign, a picture `drawText` writes
 * on, or a dialogue that wants to know where the lines of its whole page break before it shows them.
 *
 * - The block is measured as the engine places it, every letter's whole cell included: the same
 *   numbers `sizeOf`, `align` and `anchor` use. A letter that does not fill its cell measures its
 *   cell, not only its pixels.
 * - In the text's own pixels, before any scale: `sizeOf` on a text is this times its scale.
 * - It needs no game, like `drawText`: the font the engine carries is already there. A font still on
 *   its way measures `0` by `0`, with no lines.
 *
 * @param text - What it says. `\n` starts a new line.
 * @param options - The font, the size, the spacing and `maxWidth`: a text's `style`, and its font.
 * @returns How wide and tall it is, and what each line says.
 *
 * @example
 * ```ts
 * // A panel fitted to its label before the label is made.
 * const { width } = measureText('CONTINUE', { fontSize: 16 });
 * createSprite({ width: width + 16, height: 24, tint: '#1a2a5a' });
 * ```
 *
 * @example
 * ```ts
 * // Letter by letter, without a word jumping to the next line halfway through: the whole page is
 * // broken into lines with the box's own style first, and only the first letters of those lines
 * // are shown.
 * const speech = 'You made it to the village at last! The bridge to the north washed away.';
 * const style = { maxWidth: 200 };
 * const box = createText({ text: '', style });
 * const page = measureText(speech, style).lines.join('\n');
 * let shown = 0;
 * useUpdate((delta) => {
 *     shown = Math.min(page.length, shown + 30 * delta);
 *     box.text = page.slice(0, Math.floor(shown));
 * });
 * ```
 *
 * @category Layout
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export function measureText(text: string, options?: TMeasureTextOptions): TTextMeasure;
export function measureText(text: TText | string, options: TMeasureTextOptions = {}): TTextMeasure {
    if (typeof text !== 'string') {
        const { width, height, lines } = layoutOfText(text);
        // A copy: a font still on its way lays out the one empty layout every text shares.
        return { width, height, lines: [...lines] };
    }
    const font = looseFontOf(options.font, 'measureText');
    if (font.status !== 'ready') {
        return nothing();
    }
    if (font.type === 'bitmap-font') {
        const { width, height, lines } = layoutText(text, options, font.meta, bitmapFontGlyphs(font));
        return { width, height, lines };
    }
    // From the font as it was read, so measuring draws no letter into its atlas.
    const parsed = parsedFontOf(font);
    if (parsed === undefined) {
        return nothing();
    }
    const { width, height, lines } = layoutOutlineText(text, options, parsed);
    return { width, height, lines: lines.map((line) => line.text) };
}
