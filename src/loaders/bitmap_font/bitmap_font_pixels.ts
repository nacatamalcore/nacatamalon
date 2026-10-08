import { decodePng } from '../../pixels/decode_png';
import type { TBitmapFont } from './types/t_bitmap_font';
import type { TPixels } from '../../pixels/types/t_pixels';

/**
 * Each font's image as pixels in memory, beside the copy on the card, for `drawText`. Kept here
 * rather than on the font so the font stays plain data, and weak so a font nobody holds takes its
 * picture with it.
 */
const pictures = new WeakMap<TBitmapFont, TPixels>();

/**
 * Reads the font's image into memory as it arrives. An image that is not a PNG is left out: texts
 * still draw it, and only stamping it into pixels cannot, which `drawText` says when asked.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const keepBitmapFontPixels = async (font: TBitmapFont, image: Blob): Promise<void> => {
    try {
        pictures.set(font, decodePng(new Uint8Array(await image.arrayBuffer())));
    } catch {
        // Not a PNG: nothing kept, nothing broken.
    }
};

/**
 * Hands over a picture already in memory, for a font whose image was never downloaded.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setBitmapFontPixels = (font: TBitmapFont, pixels: TPixels): void => {
    pictures.set(font, pixels);
};

/**
 * The font's image in memory, or `undefined` when it has not arrived or was not a PNG.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bitmapFontPixels = (font: TBitmapFont): TPixels | undefined => pictures.get(font);
