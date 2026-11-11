import { createPixels } from './create_pixels';
import { put } from './bytes';
import type { TPixels } from './types/t_pixels';

/**
 * What `normalsFromHeight` is asked for. Both optional.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNormalsFromHeightOptions = {
    /**
     * How deep the relief is: how steeply a change of brightness leans the surface. Default `2`; `6` is
     * deeply carved stone, `0.5` a faint grain.
     */
    depth?: number;
    /**
     * Whether the picture repeats, so its edges are worked out from the other side and a tiled wall has
     * no seams. Default `true`.
     */
    wrap?: boolean;
};

/**
 * How high a pixel is: its brightness, `0` dark and low to `1` bright and high.
 */
const heightAt = (pixels: TPixels, x: number, y: number): number => {
    const at = (y * pixels.width + x) * 4;
    return (0.299 * pixels.data[at]! + 0.587 * pixels.data[at + 1]! + 0.114 * pixels.data[at + 2]!) / 255;
};

/**
 * Makes a normal map from a picture of heights: bright is high and dark is low, so the stone texture
 * itself, its mortar dark, gives the relief of its bricks. Give the result to a material's `normalMap`
 * and its surface catches the light as carved.
 *
 * Each pixel is the way the surface faces there, worked out from how fast the height changes across
 * and up the picture, as the usual lilac maps hold it: red across, green up the picture, blue out of
 * the surface.
 *
 * @param heights The picture of heights: any picture, read by its brightness.
 * @param options How deep the relief is, and whether it repeats.
 * @returns The normal map, to make a texture of with `createPixelTexture`.
 *
 * @example
 * ```ts
 * import { createMesh, useCubeGeometry } from 'nacatamalon';
 * import { createPixelTexture, normalsFromHeight } from 'nacatamalon/pixels';
 * import type { TPixels } from 'nacatamalon/pixels';
 * declare const bricks: TPixels;
 *
 * createMesh({
 *     geometry: useCubeGeometry(),
 *     texture: createPixelTexture(bricks),
 *     normalMap: createPixelTexture(normalsFromHeight(bricks, { depth: 4 })),
 * });
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const normalsFromHeight = (heights: TPixels, options: TNormalsFromHeightOptions = {}): TPixels => {
    const depth = options.depth ?? 2;
    const wrap = options.wrap ?? true;
    const { width, height } = heights;
    const out = createPixels(width, height);
    const column = (x: number): number => (wrap ? (x + width) % width : Math.min(Math.max(x, 0), width - 1));
    const row = (y: number): number => (wrap ? (y + height) % height : Math.min(Math.max(y, 0), height - 1));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // How the height changes going right, and going up the picture (rows run down).
            const across = (heightAt(heights, column(x + 1), y) - heightAt(heights, column(x - 1), y)) * 0.5;
            const up = (heightAt(heights, x, row(y - 1)) - heightAt(heights, x, row(y + 1))) * 0.5;
            let nx = -across * depth;
            let ny = -up * depth;
            let nz = 1;
            const length = Math.hypot(nx, ny, nz);
            nx /= length;
            ny /= length;
            nz /= length;
            put(out, x, y, Math.round((nx * 0.5 + 0.5) * 255), Math.round((ny * 0.5 + 0.5) * 255), Math.round((nz * 0.5 + 0.5) * 255), 255);
        }
    }
    return out;
};
