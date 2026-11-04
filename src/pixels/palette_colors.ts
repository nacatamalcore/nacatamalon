import { getColor } from '../color';
import { bytesOf } from './bytes';
import { partOf } from './edit';
import type { TColorOption } from '../color';
import type { TPixelRegion, TPixels } from './types/t_pixels';

/**
 * A colour as one whole number, red in the high bits, so a set of them costs no strings.
 */
const packed = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;

/**
 * The list of colours, each read once, with what is wrong with it said before anything is painted.
 */
const readColors = (colors: readonly TColorOption[], who: string): [number, number, number][] => {
    if (!Array.isArray(colors)) {
        throw new Error(`[NacatamalOn] ${who}: the palette is not a list of colours. Give one, like BUILTIN.PALETTES.nes or the colors of a palette you loaded.`);
    }
    if (colors.length === 0) {
        throw new Error(`[NacatamalOn] ${who}: the palette has no colours. A palette you loaded has none until it arrives, so wait for its status to be 'ready'.`);
    }
    return colors.map((color, at) => {
        let bytes: number[] = [Number.NaN];
        try {
            // A number that is none (NaN) would read as black: a typo that looks deliberate.
            if (typeof color !== 'number' || Number.isFinite(color)) {
                bytes = bytesOf(getColor(color));
            }
        } catch {
            // Said below, with the rest.
        }
        if (bytes.some((byte) => !Number.isFinite(byte))) {
            throw new Error(`[NacatamalOn] ${who}: colour ${at} of the palette is ${typeof color === 'string' ? `'${color}'` : String(color)}, which is not a colour. Write it as '#rrggbb' or a CSS name.`);
        }
        return [bytes[0]!, bytes[1]!, bytes[2]!];
    });
};

/**
 * What `snapToPalette` can be told.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSnapToPaletteOptions = {
    /**
     * Only this part of the picture.
     */
    region?: TPixelRegion;
};

/**
 * Moves every pixel to the nearest colour of a palette, by the same measure `paletteMatch` uses for
 * the screen. Alpha stays as it was, and what is fully transparent is left alone.
 *
 * It is `paletteMatch` for one picture, while it is being made: a generated sprite that really has
 * only those colours, whatever it was drawn with.
 *
 * @param pixels - The picture, changed in place.
 * @param palette - The colours, as anything `getColor` reads: `BUILTIN.PALETTES.nes`, or a list of
 * your own. The alpha of each is not looked at.
 * @param options - The part of the picture: see {@link TSnapToPaletteOptions}.
 * @returns The same picture, to go on painting.
 *
 * @example
 * ```ts
 * const sky = createPixels(64, 32);
 * fillGradient(sky, { from: getColor('#203060'), to: getColor('#f0a070') });
 * snapToPalette(sky, BUILTIN.PALETTES.nes);
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const snapToPalette = (pixels: TPixels, palette: readonly TColorOption[], options?: TSnapToPaletteOptions): TPixels => {
    const colors = readColors(palette, 'snapToPalette');
    const { left, top, right, bottom } = partOf(pixels, options?.region);
    const d = pixels.data;
    // Asked once per colour met: a picture has far fewer colours than pixels.
    const nearest = new Map<number, [number, number, number]>();
    for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
            const at = (y * pixels.width + x) * 4;
            if (d[at + 3] === 0) {
                continue;
            }
            const r = d[at]!;
            const g = d[at + 1]!;
            const b = d[at + 2]!;
            const key = packed(r, g, b);
            let found = nearest.get(key);
            if (found === undefined) {
                let best = Infinity;
                for (const color of colors) {
                    const dr = r - color[0];
                    const dg = g - color[1];
                    const db = b - color[2];
                    const distance = dr * dr + dg * dg + db * db;
                    if (distance < best) {
                        best = distance;
                        found = color;
                    }
                }
                nearest.set(key, found!);
            }
            d[at] = found![0];
            d[at + 1] = found![1];
            d[at + 2] = found![2];
        }
    }
    return pixels;
};

/**
 * What `checkColorLimit` is asked to check.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TColorLimitOptions = {
    /**
     * How many colours each part may use. Fully transparent pixels do not count, and any other is
     * counted by its red, green and blue.
     */
    colors: number;
    /**
     * The size of the parts: one number for a square, or `{ width, height }`. Left out, the whole
     * picture is one. The last ones may be cut by the picture's edge, and are checked all the same.
     */
    cell?: number | { width: number; height: number };
};

/**
 * A part of a picture using more colours than it may.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TColorLimitCell = {
    /**
     * Where it starts, in pixels of the picture.
     */
    x: number;
    y: number;
    width: number;
    height: number;
    /**
     * The colours it uses, as `#rrggbb`, in the order they are met.
     */
    colors: string[];
};

const sizeOf = (value: unknown, what: string): number => {
    if (!Number.isInteger(value) || (value as number) < 1) {
        throw new Error(`[NacatamalOn] checkColorLimit: ${what} is ${typeof value === 'string' ? `'${value}'` : String(value)}. Give a whole number of 1 or more.`);
    }
    return value as number;
};

/**
 * Says which parts of a picture use more colours than they may, as the machines of the era limited
 * them: three and transparent in a NES sprite's 8 by 8, four in a Game Boy's.
 *
 * It only looks. Nothing is warned about or changed: what comes back is for a test to check, or for
 * whoever is drawing to read and correct.
 *
 * @param pixels - The picture.
 * @param options - How many colours, and in what size of part: see {@link TColorLimitOptions}.
 * @returns The parts over the limit, row by row. Empty when all of it fits.
 *
 * @example
 * ```ts
 * declare const hero: TPixels;
 *
 * const over = checkColorLimit(hero, { cell: 8, colors: 3 });
 * for (const cell of over) {
 *     console.log(`At ${cell.x}, ${cell.y}: ${cell.colors.join(' ')}`);
 * }
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const checkColorLimit = (pixels: TPixels, options: TColorLimitOptions): TColorLimitCell[] => {
    const limit = sizeOf(options?.colors, 'colors');
    const cell = options.cell;
    const cellWidth = cell === undefined ? pixels.width : sizeOf(typeof cell === 'object' && cell !== null ? cell.width : cell, 'the width of a cell');
    const cellHeight = cell === undefined ? pixels.height : sizeOf(typeof cell === 'object' && cell !== null ? cell.height : cell, 'the height of a cell');

    const d = pixels.data;
    const over: TColorLimitCell[] = [];
    const seen = new Set<number>();
    for (let top = 0; top < pixels.height; top += cellHeight) {
        const bottom = Math.min(pixels.height, top + cellHeight);
        for (let left = 0; left < pixels.width; left += cellWidth) {
            const right = Math.min(pixels.width, left + cellWidth);
            seen.clear();
            for (let y = top; y < bottom; y++) {
                for (let x = left; x < right; x++) {
                    const at = (y * pixels.width + x) * 4;
                    if (d[at + 3] !== 0) {
                        seen.add(packed(d[at]!, d[at + 1]!, d[at + 2]!));
                    }
                }
            }
            if (seen.size > limit) {
                over.push({
                    x: left,
                    y: top,
                    width: right - left,
                    height: bottom - top,
                    colors: Array.from(seen, (color) => `#${color.toString(16).padStart(6, '0')}`),
                });
            }
        }
    }
    return over;
};
