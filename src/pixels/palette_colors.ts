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
const readColors = (colors: readonly TColorOption[], who: string, what: 'palette' | 'ramp' = 'palette'): [number, number, number][] => {
    if (!Array.isArray(colors)) {
        throw new Error(what === 'ramp'
            ? `[NacatamalOn] ${who}: a ramp is not a list of colours. Give each as a list, from darkest to lightest.`
            : `[NacatamalOn] ${who}: the palette is not a list of colours. Give one, like BUILTIN.PALETTES.nes or the colors of a palette you loaded.`);
    }
    if (colors.length === 0) {
        throw new Error(what === 'ramp'
            ? `[NacatamalOn] ${who}: a ramp has no colours. Give it two or more, from darkest to lightest.`
            : `[NacatamalOn] ${who}: the palette has no colours. A palette you loaded has none until it arrives, so wait for its status to be 'ready'.`);
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
            throw new Error(`[NacatamalOn] ${who}: colour ${at} of the ${what} is ${typeof color === 'string' ? `'${color}'` : String(color)}, which is not a colour. Write it as '#rrggbb' or a CSS name.`);
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
 * fillGradient(sky, { from: '#203060', to: '#f0a070' });
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

/**
 * What `shadeWithRamp` can be told.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShadeWithRampOptions = {
    /**
     * Where the light comes from, as a direction on the picture: `{ x: -1, y: -1 }` is the top left,
     * the default and the usual one for pixel art, and `{ x: 1, y: 0 }` the right.
     */
    light?: { x: number; y: number };
    /**
     * Only this part of the picture, which is looked at as if it were the whole picture: one frame of
     * a sheet.
     */
    region?: TPixelRegion;
};

/**
 * Gives flat colours a side lit and a side in shadow: each pixel on the edge of a shape that faces
 * the light moves one step up its ramp, and each one on the edge facing away moves one step down.
 * What is in between stays, and so does a pixel with an edge on both sides.
 *
 * A ramp is a list of colours from darkest to lightest, and a colour in none of them is left alone,
 * so skin and cloth each shade along their own. The shape is everything that is not fully transparent.
 * Alpha stays as it was.
 *
 * @param pixels - The picture, changed in place.
 * @param ramps - One ramp, or a list of them, each colour as anything `getColor` reads. Colours are
 * matched exactly. A colour at the end of its ramp has nowhere further to go, and stays.
 * @param options - Where the light comes from, and the part of the picture: see
 * {@link TShadeWithRampOptions}.
 * @returns The same picture, to go on painting.
 *
 * @example
 * ```ts
 * const ball = pixelsFromRows(['.mmm.', 'mmmmm', 'mmmmm', 'mmmmm', '.mmm.'], { m: '#c8553d' });
 * shadeWithRamp(ball, ['#7a2e22', '#c8553d', '#f0a37a']);
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const shadeWithRamp = (pixels: TPixels, ramps: readonly TColorOption[] | readonly (readonly TColorOption[])[], options?: TShadeWithRampOptions): TPixels => {
    if (!Array.isArray(ramps) || ramps.length === 0) {
        throw new Error('[NacatamalOn] shadeWithRamp: there is no ramp. Give a list of colours from darkest to lightest, or a list of such lists.');
    }
    const list = (Array.isArray(ramps[0]) ? ramps : [ramps]) as readonly (readonly TColorOption[])[];
    // Each colour, to where it goes up and down its ramp. The first ramp to name a colour keeps it.
    const steps = new Map<number, { up: [number, number, number]; down: [number, number, number] }>();
    for (const ramp of list) {
        const colors = readColors(ramp, 'shadeWithRamp', 'ramp');
        if (colors.length < 2) {
            throw new Error('[NacatamalOn] shadeWithRamp: a ramp has one colour, so there is nowhere to go. Give it two or more, from darkest to lightest.');
        }
        colors.forEach((color, at) => {
            const key = packed(color[0], color[1], color[2]);
            if (!steps.has(key)) {
                steps.set(key, { up: colors[Math.min(colors.length - 1, at + 1)]!, down: colors[Math.max(0, at - 1)]! });
            }
        });
    }

    const light = options?.light ?? { x: -1, y: -1 };
    const longest = Math.max(Math.abs(light.x), Math.abs(light.y));
    if (!Number.isFinite(light.x) || !Number.isFinite(light.y) || longest === 0) {
        throw new Error(`[NacatamalOn] shadeWithRamp: the light comes from { x: ${String(light.x)}, y: ${String(light.y)} }, which is no direction. Give one like { x: -1, y: -1 }, the top left.`);
    }
    // To a neighbour on the grid: a side counts when the light comes at least half as much from it.
    const towardX = Math.abs(light.x) * 2 >= longest ? Math.sign(light.x) : 0;
    const towardY = Math.abs(light.y) * 2 >= longest ? Math.sign(light.y) : 0;

    const { left, top, right, bottom } = partOf(pixels, options?.region);
    const wide = right - left;
    const high = bottom - top;
    if (!(wide > 0) || !(high > 0)) {
        return pixels;
    }
    const d = pixels.data;
    const solid = new Uint8Array(wide * high);
    for (let y = 0; y < high; y++) {
        for (let x = 0; x < wide; x++) {
            solid[y * wide + x] = d[((y + top) * pixels.width + x + left) * 4 + 3]! > 0 ? 1 : 0;
        }
    }
    const empty = (x: number, y: number): boolean => x < 0 || y < 0 || x >= wide || y >= high || solid[y * wide + x] === 0;
    const open = (x: number, y: number, sign: number): boolean =>
        (towardX !== 0 && empty(x + towardX * sign, y)) || (towardY !== 0 && empty(x, y + towardY * sign));

    for (let y = 0; y < high; y++) {
        for (let x = 0; x < wide; x++) {
            if (solid[y * wide + x] === 0) {
                continue;
            }
            const lit = open(x, y, 1);
            const shaded = open(x, y, -1);
            if (lit === shaded) {
                continue;
            }
            const at = ((y + top) * pixels.width + x + left) * 4;
            const step = steps.get(packed(d[at]!, d[at + 1]!, d[at + 2]!));
            if (step !== undefined) {
                const color = lit ? step.up : step.down;
                d[at] = color[0];
                d[at + 1] = color[1];
                d[at + 2] = color[2];
            }
        }
    }
    return pixels;
};

