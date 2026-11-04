import { bytesOf, put } from './bytes';
import type { TColor } from '../color';
import type { TPixels, TPixelRegion } from './types/t_pixels';

/**
 * A copy of a picture that can be painted on without touching the original.
 *
 * @param pixels - The picture to copy.
 * @returns A new picture with the same size and the same pixels.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const clonePixels = (pixels: TPixels): TPixels => ({
    type: 'pixels',
    width: pixels.width,
    height: pixels.height,
    data: pixels.data.slice(),
});

/**
 * Replaces colours with others, exactly: every pixel that is one of the `from` colours, alpha
 * included, becomes its `to`. Every other pixel is left alone.
 *
 * It is the palette swap of the consoles of the era: one drawn enemy, and the red, blue and gold
 * versions made from it, with no extra picture drawn. Swaps are worked out from the picture as it
 * was, so swapping red for blue and blue for red at once trades them rather than turning both blue.
 *
 * @param pixels - The picture, changed in place.
 * @param pairs - Each colour to replace, and what replaces it.
 * @returns The same picture, to go on painting.
 *
 * @example
 * ```ts
 * const hero = useLoadPixels({ src: '/assets/hero.png' });
 * const red = createPixelTexture(hero, (p) => swapColors(p, [[getColor('#3a7bff'), getColor('#e23d3d')]]));
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const swapColors = (pixels: TPixels, pairs: ReadonlyArray<readonly [TColor, TColor]>): TPixels => {
    const swaps = new Map<number, [number, number, number, number]>();
    for (const [from, to] of pairs) {
        const [r, g, b, a] = bytesOf(from);
        swaps.set(((r << 24) | (g << 16) | (b << 8) | a) >>> 0, bytesOf(to));
    }
    const d = pixels.data;
    for (let at = 0; at < d.length; at += 4) {
        const to = swaps.get(((d[at]! << 24) | (d[at + 1]! << 16) | (d[at + 2]! << 8) | d[at + 3]!) >>> 0);
        if (to !== undefined) {
            d[at] = to[0];
            d[at + 1] = to[1];
            d[at + 2] = to[2];
            d[at + 3] = to[3];
        }
    }
    return pixels;
};

/**
 * The part of a picture a region asks for, cut to its edges, right and bottom left out. All of it
 * when none is asked for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const partOf = (pixels: TPixels, region: TPixelRegion | undefined): { left: number; top: number; right: number; bottom: number } => {
    if (region === undefined) {
        return { left: 0, top: 0, right: pixels.width, bottom: pixels.height };
    }
    return {
        left: Math.max(0, Math.floor(region.x)),
        top: Math.max(0, Math.floor(region.y)),
        right: Math.min(pixels.width, Math.floor(region.x) + Math.floor(region.width)),
        bottom: Math.min(pixels.height, Math.floor(region.y) + Math.floor(region.height)),
    };
};

/**
 * What `outlinePixels` can be told.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TOutlinePixelsOptions = {
    /**
     * Fills the corners too, so a diagonal edge gets a thicker, closed border. Default `false`: only
     * the pixels right above, below and beside the shape, the outline pixel art usually has.
     */
    corners?: boolean;
    /**
     * Keeps it to this part of the picture, which is looked at as if it were the whole picture: on a
     * sheet, one frame's outline does not spill into the next, nor does the next one's art grow an
     * outline here.
     */
    region?: TPixelRegion;
};

/**
 * Draws a border one pixel wide around everything that is not fully transparent. It goes on the
 * transparent pixels around the shape, never over the shape, and is worked out from the picture as
 * it was, so it never outlines itself.
 *
 * The picture does not grow: a shape touching the edge has no outline on that side, so draw it with
 * a pixel of room around it.
 *
 * @param pixels - The picture, changed in place.
 * @param color - The border's colour.
 * @param options - Its corners, and the part of the picture: see {@link TOutlinePixelsOptions}.
 * @returns The same picture, to go on painting.
 *
 * @example
 * ```ts
 * const heart = pixelsFromRows([
 *     '.........',
 *     '..rr.rr..',
 *     '.rrrrrrr.',
 *     '..rrrrr..',
 *     '...rrr...',
 *     '....r....',
 *     '.........',
 * ], { r: '#f80058' });
 * outlinePixels(heart, getColor('#14141f'));
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const outlinePixels = (pixels: TPixels, color: TColor, options?: TOutlinePixelsOptions): TPixels => {
    const { left, top, right, bottom } = partOf(pixels, options?.region);
    const wide = right - left;
    const high = bottom - top;
    // Not `> 0`: a region of NaN comes out of `partOf` as NaN, and asks for nothing.
    if (!(wide > 0) || !(high > 0)) {
        return pixels;
    }
    const d = pixels.data;
    const corners = options?.corners === true;
    const [r, g, b, a] = bytesOf(color);
    const solid = new Uint8Array(wide * high);
    for (let y = 0; y < high; y++) {
        for (let x = 0; x < wide; x++) {
            solid[y * wide + x] = d[((y + top) * pixels.width + x + left) * 4 + 3]! > 0 ? 1 : 0;
        }
    }
    const isSolid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < wide && y < high && solid[y * wide + x] === 1;
    for (let y = 0; y < high; y++) {
        for (let x = 0; x < wide; x++) {
            if (solid[y * wide + x] === 1) {
                continue;
            }
            const touches = isSolid(x - 1, y) || isSolid(x + 1, y) || isSolid(x, y - 1) || isSolid(x, y + 1)
                || (corners && (isSolid(x - 1, y - 1) || isSolid(x + 1, y - 1) || isSolid(x - 1, y + 1) || isSolid(x + 1, y + 1)));
            if (touches) {
                put(pixels, x + left, y + top, r, g, b, a);
            }
        }
    }
    return pixels;
};

/**
 * What `mirrorPixels` can be told.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMirrorPixelsOptions = {
    /**
     * Mirrors only this part of the picture, about its own middle: one frame of a sheet. What falls
     * off the picture is cut first, so the middle is that of what is left.
     */
    region?: TPixelRegion;
};

/**
 * Copies one half of a picture onto the other, turned round: draw half of something symmetric, and
 * this draws the rest.
 *
 * `'x'` copies the left half onto the right, `'y'` the top half onto the bottom. What the half
 * written over had is replaced, transparent pixels included. On an odd size the middle row or column
 * stays as it is.
 *
 * @param pixels - The picture, changed in place.
 * @param axis - Which way: `'x'` left onto right, `'y'` top onto bottom.
 * @param options - The part of the picture: see {@link TMirrorPixelsOptions}.
 * @returns The same picture, to go on painting.
 *
 * @example
 * ```ts
 * // The left half and the middle column of a robot. The right half is copied.
 * const robot = pixelsFromRows([
 *     '....k....',
 *     '.kkkk....',
 *     'kwwkk....',
 *     'kkkkk....',
 * ], { k: '#14141f', w: '#ffffff' });
 * mirrorPixels(robot, 'x');
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mirrorPixels = (pixels: TPixels, axis: 'x' | 'y', options?: TMirrorPixelsOptions): TPixels => {
    if (axis !== 'x' && axis !== 'y') {
        throw new Error(`[NacatamalOn] mirrorPixels: the axis is '${String(axis)}'. Use 'x' to copy left onto right, or 'y' to copy top onto bottom.`);
    }
    const { left, top, right, bottom } = partOf(pixels, options?.region);
    const d = pixels.data;
    const copy = (fromX: number, fromY: number, toX: number, toY: number): void => {
        const from = (fromY * pixels.width + fromX) * 4;
        const to = (toY * pixels.width + toX) * 4;
        d[to] = d[from]!;
        d[to + 1] = d[from + 1]!;
        d[to + 2] = d[from + 2]!;
        d[to + 3] = d[from + 3]!;
    };
    // Each half is the first floor(size / 2) rows or columns: on an odd size the middle is in neither.
    if (axis === 'x') {
        const half = Math.floor((right - left) / 2);
        for (let y = top; y < bottom; y++) {
            for (let i = 0; i < half; i++) {
                copy(left + i, y, right - 1 - i, y);
            }
        }
    } else {
        const half = Math.floor((bottom - top) / 2);
        for (let x = left; x < right; x++) {
            for (let i = 0; i < half; i++) {
                copy(x, top + i, x, bottom - 1 - i);
            }
        }
    }
    return pixels;
};
