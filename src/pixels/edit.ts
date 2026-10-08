import { bytesOf } from './bytes';
import type { TColor } from '../color';
import type { TPixels } from './types/t_pixels';

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
