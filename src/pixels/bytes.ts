import type { TColor } from '../color';
import type { TPixels } from './types/t_pixels';

/**
 * One channel from `0`–`1` to a byte, rounded and kept in range.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const toByte = (value: number): number => (value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255));

/**
 * Writes a colour into one pixel that is known to be inside the picture. Nothing is blended: the
 * colour replaces what was there, alpha included.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const put = (pixels: TPixels, x: number, y: number, r: number, g: number, b: number, a: number): void => {
    const at = (y * pixels.width + x) * 4;
    pixels.data[at] = r;
    pixels.data[at + 1] = g;
    pixels.data[at + 2] = b;
    pixels.data[at + 3] = a;
};

/**
 * A colour as its four bytes, worked out once for a whole fill instead of once per pixel.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bytesOf = (color: TColor): [number, number, number, number] =>
    [toByte(color.r), toByte(color.g), toByte(color.b), toByte(color.a)];
