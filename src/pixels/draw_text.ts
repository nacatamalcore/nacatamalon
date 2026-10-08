import { getActiveGame } from '../store';
import { layoutText } from '../gameobjects/text/layout_text';
import { DEFAULT_FONT_SIZE } from '../gameobjects/text/layout_font_text';
import { defaultFontInMemory } from '../gameobjects/text/default_font';
import { bitmapFontGlyphs } from '../loaders/bitmap_font/bitmap_font_glyphs';
import { bitmapFontPixels } from '../loaders/bitmap_font/bitmap_font_pixels';
import { parsedFontOf } from '../loaders/font/font_glyphs';
import { fillOutline } from './fill_outline';
import type { TColor } from '../color';
import type { TBitmapFont } from '../loaders/bitmap_font/types/t_bitmap_font';
import type { TFont } from '../loaders/font/types/t_font';
import type { TOutline } from '../loaders/font/sfnt/t_outline';
import type { TTextStyle } from '../gameobjects/text/types/t_text_style';
import type { TPixels } from './types/t_pixels';
import type { TPolygon } from './fill_outline';

/**
 * How `drawText` writes: the font, the colour, and the same size and spacing a text on screen takes.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawTextOptions = TTextStyle & {
    /**
     * A font from `useLoadFont` or `useLoadBitmapFont`, or the key one was loaded under. A key is
     * looked up in the scene body, where `createText` looks up its own. Left out, the font the
     * engine carries, which needs no game and no loading.
     */
    font?: TBitmapFont | TFont | string;
    /**
     * What the letters are painted in. Default white. A bitmap font's own colours are multiplied by
     * it, the way a text's tint is.
     */
    color?: TColor;
    /**
     * Which point of the block of text lands on `x, y`, from `0, 0` (its top-left corner, the
     * default) to `1, 1` (its bottom-right). `0.5, 0.5` centres it on the point, which is what a
     * sign wants.
     */
    anchor?: { x: number; y: number };
    /**
     * For a vector font: soft edges (the default) or hard ones, every pixel in or out, for a
     * picture that stays pixel art. A bitmap font is copied pixel for pixel either way.
     */
    smooth?: boolean;
};

const WHITE: TColor = { r: 1, g: 1, b: 1, a: 1 };

/**
 * Fonts already warned about, so a font that failed says it once and not every time it is asked.
 */
const warned = new WeakSet<object>();

const warnOnce = (font: TBitmapFont | TFont, message: string): void => {
    if (!warned.has(font)) {
        warned.add(font);
        console.warn(`[NacatamalOn] drawText: ${message}`);
    }
};

const fontOf = (font: TDrawTextOptions['font']): TBitmapFont | TFont => {
    if (font === undefined) {
        return defaultFontInMemory();
    }
    if (typeof font !== 'string') {
        return font;
    }
    const store = getActiveGame();
    if (store === null) {
        throw new Error(
            `[NacatamalOn] drawText: the font '${font}' is a key, and a key is looked up while a scene ` +
            'is being built. Elsewhere (a useWatch, a useUpdate) pass the font itself.',
        );
    }
    const assets = store.get('assets');
    const found = assets.fonts.get(font) ?? assets.bitmapFonts.get(font);
    if (found === undefined) {
        throw new Error(
            `[NacatamalOn] drawText: no font loaded under key '${font}'. ` +
            `Did you forget useLoadFont({ src, key: '${font}' }) in an earlier scene?`,
        );
    }
    return found;
};

/**
 * Copies each letter out of the font's picture, stretched to the size asked for by repeating whole
 * pixels, which is how a bitmap font is meant to grow.
 */
const drawBitmapText = (pixels: TPixels, text: string, x: number, y: number, font: TBitmapFont, options: TDrawTextOptions): void => {
    const atlas = bitmapFontPixels(font);
    if (atlas === undefined) {
        warnOnce(font, `'${font.key}' has no picture this engine can read into pixels (it has to be a PNG), so nothing is drawn.`);
        return;
    }
    const layout = layoutText(text, options, font.meta, bitmapFontGlyphs(font));
    const color = options.color ?? WHITE;
    const left = x - layout.width * (options.anchor?.x ?? 0);
    const top = y - layout.height * (options.anchor?.y ?? 0);
    const src = atlas.data;
    const dst = pixels.data;

    for (const placement of layout.placements) {
        const { source } = placement;
        // Both edges rounded, rather than one edge and a width, so letters side by side meet
        // without a gap or an overlap whatever the scale.
        const x0 = Math.round(left + placement.x);
        const y0 = Math.round(top + placement.y);
        const width = Math.round(left + placement.x + placement.width) - x0;
        const height = Math.round(top + placement.y + placement.height) - y0;
        for (let j = 0; j < height; j++) {
            const ty = y0 + j;
            if (ty < 0 || ty >= pixels.height) {
                continue;
            }
            const sy = source.y + Math.floor(((j + 0.5) * source.height) / height);
            for (let i = 0; i < width; i++) {
                const tx = x0 + i;
                if (tx < 0 || tx >= pixels.width) {
                    continue;
                }
                const sx = source.x + Math.floor(((i + 0.5) * source.width) / width);
                const from = (sy * atlas.width + sx) * 4;
                const a = (src[from + 3]! / 255) * color.a;
                if (a <= 0) {
                    continue;
                }
                const to = (ty * pixels.width + tx) * 4;
                const under = dst[to + 3]! / 255;
                const out = a + under * (1 - a);
                dst[to] = Math.round((src[from]! * color.r * a + dst[to]! * under * (1 - a)) / out);
                dst[to + 1] = Math.round((src[from + 1]! * color.g * a + dst[to + 1]! * under * (1 - a)) / out);
                dst[to + 2] = Math.round((src[from + 2]! * color.b * a + dst[to + 2]! * under * (1 - a)) / out);
                dst[to + 3] = Math.round(out * 255);
            }
        }
    }
};

/**
 * Most of a pixel a curve may stray from the straight pieces it is drawn with.
 */
const FLATNESS = 0.2;

/**
 * Turns one letter's outline into corners in the picture: moved to where the letter goes, scaled
 * from font units, turned the right way up (fonts count upwards), and its curves cut into straight
 * pieces short enough not to show.
 */
const outlineToPolygons = (outline: TOutline, originX: number, baseline: number, units: number, out: TPolygon[]): void => {
    for (const contour of outline) {
        const polygon: TPolygon = [];
        for (const segment of contour) {
            const x0 = originX + segment.x0 * units;
            const y0 = baseline - segment.y0 * units;
            polygon.push(x0, y0);
            if (segment.kind === 'quad') {
                const cx = originX + segment.cx * units;
                const cy = baseline - segment.cy * units;
                const x1 = originX + segment.x1 * units;
                const y1 = baseline - segment.y1 * units;
                // How far the curve bows away from its chord decides how many pieces it needs.
                const bow = Math.hypot(x0 - 2 * cx + x1, y0 - 2 * cy + y1) / 4;
                const steps = Math.max(1, Math.ceil(Math.sqrt(bow / FLATNESS)));
                for (let s = 1; s < steps; s++) {
                    const t = s / steps;
                    const u = 1 - t;
                    polygon.push(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1);
                }
            }
        }
        if (polygon.length >= 6) {
            out.push(polygon);
        }
    }
};

/**
 * Draws the letters straight from the font's outlines at the size asked for, so they are as sharp
 * in a picture as the font allows at that size.
 */
const drawVectorText = (pixels: TPixels, text: string, x: number, y: number, font: TFont, options: TDrawTextOptions): void => {
    const parsed = parsedFontOf(font);
    if (parsed === undefined) {
        return;
    }
    const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
    const units = fontSize / parsed.unitsPerEm;
    const letterSpacing = options.letterSpacing ?? 0;
    const lineSpacing = options.lineSpacing ?? 0;
    // The same lines as a text on screen in the same font, so the two can be set side by side.
    const lineHeight = (parsed.ascender - parsed.descender + parsed.lineGap) * units;
    const baseline = (parsed.ascender + parsed.lineGap / 2) * units;

    const lines = text.split('\n').map((line) => {
        const glyphs: Array<{ glyph: number; pen: number }> = [];
        let pen = 0;
        let previous = -1;
        for (const char of line) {
            const glyph = parsed.glyphIndex(char.codePointAt(0) ?? 0);
            if (previous >= 0) {
                pen += parsed.kerning(previous, glyph) * units;
            }
            glyphs.push({ glyph, pen });
            pen += parsed.advance(glyph) * units + letterSpacing;
            previous = glyph;
        }
        return { glyphs, width: glyphs.length > 0 ? pen - letterSpacing : 0 };
    });

    const width = Math.max(0, ...lines.map((line) => line.width));
    const height = lines.length * lineHeight + (lines.length - 1) * lineSpacing;
    const left = x - width * (options.anchor?.x ?? 0);
    const top = y - height * (options.anchor?.y ?? 0);
    const align = options.align ?? 'left';

    const polygons: TPolygon[] = [];
    lines.forEach((line, row) => {
        const offset = align === 'center' ? (width - line.width) / 2 : align === 'right' ? width - line.width : 0;
        const lineBaseline = top + row * (lineHeight + lineSpacing) + baseline;
        for (const { glyph, pen } of line.glyphs) {
            outlineToPolygons(parsed.outline(glyph), left + offset + pen, lineBaseline, units, polygons);
        }
    });
    fillOutline(pixels, polygons, options.color ?? WHITE, options.smooth ?? true);
};

/**
 * Writes text into a picture: the name on a sign, a number on a door, a label on a crate. Once it is
 * in the pixels it is part of the art, and turns, scales and lights with whatever shows it.
 *
 * It lays the text out exactly as `createText` does, with the same `fontSize`, `align` and
 * spacing, and works with either kind of font: a bitmap font is copied pixel for pixel, and a vector
 * font is drawn from its outlines at the size asked for.
 *
 * **With no font it needs nothing at all**: the font the engine carries is already inside it, so a
 * build script or a test can write text too. A loaded font has to have arrived. One loaded in an
 * earlier scene and named by its key is ready; in the scene that loads it, draw in a `useWatch` on
 * the font, which runs again once it is here, and send the change on with `updatePixelTexture`.
 * Until then this draws nothing and says nothing.
 *
 * @param pixels - The picture.
 * @param text - What to write. `\n` starts a new line.
 * @param x - Where it goes, from the left: the block's top-left corner unless `anchor` says another.
 * @param y - Where it goes, from the top.
 * @param options - The font, the colour, the size and the spacing.
 * @returns The same picture, to go on painting.
 *
 * @example
 * ```ts
 * const sign = createPixels(64, 20, getColor('#2a1a3a'));
 * drawText(sign, 'MOTEL', 32, 10, { anchor: { x: 0.5, y: 0.5 }, color: getColor('#ff4fd8') });
 * createSprite({ texture: createPixelTexture(sign) });
 * ```
 *
 * @example
 * ```ts
 * // A loaded font, in the scene that loads it.
 * const title = useLoadFont({ src: '/fonts/Bangers-Regular.ttf' });
 * const board = createPixels(128, 40);
 * const texture = createPixelTexture(board);
 * useWatch(() => {
 *     drawText(board, 'SUNSET', 64, 20, { font: title, fontSize: 32, anchor: { x: 0.5, y: 0.5 } });
 *     updatePixelTexture(texture);
 * }, [title]);
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawText = (pixels: TPixels, text: string, x: number, y: number, options: TDrawTextOptions = {}): TPixels => {
    const font = fontOf(options.font);
    if (font.status === 'error') {
        warnOnce(font, `'${font.key}' could not be loaded, so nothing is drawn with it.`);
        return pixels;
    }
    if (font.status !== 'ready') {
        return pixels;
    }
    if (font.type === 'bitmapFont') {
        drawBitmapText(pixels, text, x, y, font, options);
    } else {
        drawVectorText(pixels, text, x, y, font, options);
    }
    return pixels;
};
