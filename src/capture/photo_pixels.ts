import type { TPixelRegion, TPixels } from '../pixels';

/**
 * A region of a screen-sized picture cut out and made `width` × `height`, by whole pixels: each pixel
 * of the result is the one of the region under its middle, never a blend, as pixel art is scaled.
 * What falls outside the screen comes out transparent.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cutAndScale = (
    source: { width: number; height: number; data: Uint8Array },
    region: TPixelRegion,
    width: number,
    height: number,
): TPixels => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const data = new Uint8Array(w * h * 4);
    const stepX = region.width / w;
    const stepY = region.height / h;
    for (let y = 0; y < h; y++) {
        const sy = Math.floor(region.y + (y + 0.5) * stepY);
        if (sy < 0 || sy >= source.height) {
            continue;
        }
        for (let x = 0; x < w; x++) {
            const sx = Math.floor(region.x + (x + 0.5) * stepX);
            if (sx < 0 || sx >= source.width) {
                continue;
            }
            const from = (sy * source.width + sx) * 4;
            const to = (y * w + x) * 4;
            data[to] = source.data[from]!;
            data[to + 1] = source.data[from + 1]!;
            data[to + 2] = source.data[from + 2]!;
            data[to + 3] = source.data[from + 3]!;
        }
    }
    return { type: 'pixels', width: w, height: h, data };
};

/**
 * How big a photo of `region` comes out: what was asked, the other side keeping the region's shape
 * when only one was, or the region's own size.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const photoSize = (region: TPixelRegion, width?: number, height?: number): { width: number; height: number } => {
    if (width !== undefined && height !== undefined) {
        return { width, height };
    }
    if (width !== undefined) {
        return { width, height: region.width > 0 ? (width * region.height) / region.width : width };
    }
    if (height !== undefined) {
        return { width: region.height > 0 ? (height * region.width) / region.height : height, height };
    }
    return { width: region.width, height: region.height };
};
