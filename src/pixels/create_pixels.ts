import { bytesOf } from './bytes';
import type { TColor } from '../color';
import type { TPixels } from './types/t_pixels';

/**
 * A new picture to paint on in code, transparent or filled with one colour: what to use **instead of a
 * `<canvas>`** whenever a picture has to be generated rather than drawn.
 *
 * Drawn art (characters, tiles, backgrounds) is made in a pixel-art editor and loaded with
 * `useLoadTexture`. This is for the pictures nobody draws by hand: procedural variations, placeholders,
 * noise and masks for a shader, a picture that changes while the game runs, or art made by an agent
 * that has no image editor. A canvas only exists in a browser; this runs the same there, on the
 * native runtime and in a test.
 *
 * It lives in memory only: paint it with `fillRect`, `drawLine`, `fillGradient` and the rest, then
 * make it a texture with `createPixelTexture`. It needs no game, so a build script or a test can make
 * one too.
 *
 * @param width - In pixels, at least `1`.
 * @param height - In pixels, at least `1`.
 * @param fill - The colour every pixel starts as. Left out, fully transparent.
 * @returns The picture.
 *
 * @example
 * ```ts
 * const tile = createPixels(16, 16, getColor('#2a6b3a'));
 * fillRect(tile, 0, 15, 16, 1, getColor('#1a4a28'));
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createPixels = (width: number, height: number, fill?: TColor): TPixels => {
    const w = Math.floor(width);
    const h = Math.floor(height);
    if (!(w >= 1 && h >= 1)) {
        throw new Error(`[NacatamalOn] createPixels: a picture needs a width and height of at least 1, and was asked for ${width} by ${height}.`);
    }

    const data = new Uint8Array(w * h * 4);
    if (fill !== undefined) {
        const [r, g, b, a] = bytesOf(fill);
        for (let at = 0; at < data.length; at += 4) {
            data[at] = r;
            data[at + 1] = g;
            data[at + 2] = b;
            data[at + 3] = a;
        }
    }
    return { type: 'pixels', width: w, height: h, data };
};
