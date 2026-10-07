import { bayerAt } from './bayer';
import { bytesOf, put } from './bytes';
import type { TColor } from '../color';
import type { TPixelRegion, TPixels } from './types/t_pixels';

/**
 * The part of a picture a fill covers: the region asked for, cut to the picture, or all of it.
 */
const areaOf = (pixels: TPixels, region?: TPixelRegion) => {
    const left = Math.max(0, Math.floor(region?.x ?? 0));
    const top = Math.max(0, Math.floor(region?.y ?? 0));
    const right = Math.min(pixels.width, region === undefined ? pixels.width : Math.floor(region.x) + Math.floor(region.width));
    const bottom = Math.min(pixels.height, region === undefined ? pixels.height : Math.floor(region.y) + Math.floor(region.height));
    return { left, top, right, bottom };
};

/**
 * What `fillGradient` is asked for.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFillGradientOptions = {
    /**
     * The colour it starts at. With `to`, a gradient between two colours.
     */
    from?: TColor;
    /**
     * The colour it ends at.
     */
    to?: TColor;
    /**
     * Several colours, evenly spaced, in place of `from` and `to`: a sunset from deep blue through
     * purple and red to orange.
     */
    colors?: readonly TColor[];
    /**
     * `'down'` (default) runs from the top edge to the bottom one; `'right'` from left to right.
     */
    direction?: 'down' | 'right';
    /**
     * How many flat steps it is cut into, the way a sky was drawn when a game had few colours to
     * spare. Left out or below `2`, it is smooth.
     */
    bands?: number;
    /**
     * Breaks the line between two steps with the ordered pattern the `dither()` effect uses, so the
     * steps blend into each other instead of meeting in a hard edge. Only with `bands`.
     */
    dither?: boolean;
    /**
     * Only this rectangle is painted, and the gradient runs across it. Left out, the whole picture.
     */
    region?: TPixelRegion;
};

/**
 * Fills the picture with a gradient, smooth or cut into the flat bands of a sky from the era, with an
 * ordered dither between the bands if you want it.
 *
 * @param pixels - The picture.
 * @param options - The colours, the direction and how it is stepped.
 * @returns The same picture, to go on painting.
 *
 * @example
 * ```ts
 * const sky = createPixels(320, 120);
 * fillGradient(sky, {
 *     colors: ['#140a33', '#5a1667', '#e0446e', '#ffb36b'].map((hex) => getColor(hex)),
 *     bands: 12,
 *     dither: true,
 * });
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillGradient = (pixels: TPixels, options: TFillGradientOptions): TPixels => {
    const colors = options.colors ?? [options.from, options.to].filter((color): color is TColor => color !== undefined);
    if (colors.length < 2) {
        throw new Error('[NacatamalOn] fillGradient: a gradient needs two colours, as `from` and `to` or in `colors`.');
    }
    const stops = colors.map(bytesOf);
    const { left, top, right, bottom } = areaOf(pixels, options.region);
    const across = options.direction === 'right';
    const length = across ? right - left : bottom - top;
    const bands = options.bands !== undefined && options.bands >= 2 ? Math.floor(options.bands) : 0;
    const last = stops.length - 1;

    for (let py = top; py < bottom; py++) {
        for (let px = left; px < right; px++) {
            const along = across ? px - left : py - top;
            let t = length > 1 ? along / (length - 1) : 0;
            if (bands > 0) {
                // The dither moves each pixel by up to half a step either way, which is exactly what
                // lets the two steps around a boundary take turns there and nowhere else.
                const step = t * (bands - 1) + (options.dither === true ? bayerAt(px, py) : 0);
                t = Math.min(bands - 1, Math.max(0, Math.round(step))) / (bands - 1);
            }
            const at = t * last;
            const i = Math.min(last - 1, Math.floor(at));
            const f = at - i;
            const a = stops[i]!;
            const b = stops[i + 1]!;
            put(
                pixels, px, py,
                Math.round(a[0] + (b[0] - a[0]) * f),
                Math.round(a[1] + (b[1] - a[1]) * f),
                Math.round(a[2] + (b[2] - a[2]) * f),
                Math.round(a[3] + (b[3] - a[3]) * f),
            );
        }
    }
    return pixels;
};

/**
 * A number from `0` to `1` for one corner of the noise grid, the same every time for the same corner
 * and seed. Integer arithmetic only, so it is identical on every engine that runs JavaScript.
 */
const corner = (x: number, y: number, seed: number, octave: number): number => {
    let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9) ^ Math.imul(octave + 1, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
};

/**
 * What `fillNoise` is asked for.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFillNoiseOptions = {
    /**
     * Which noise. The same seed always gives the same picture. Default `1`.
     */
    seed?: number;
    /**
     * How big its blobs are, in pixels. Default `8`.
     */
    scale?: number;
    /**
     * How many layers of finer detail are added, each half the size and half as strong. Default `1`;
     * `4` or so for clouds and rock.
     */
    octaves?: number;
    /**
     * The colour of the lowest values. Default black.
     */
    from?: TColor;
    /**
     * The colour of the highest values. Default white.
     */
    to?: TColor;
};

/**
 * Fills the picture with smooth noise: clouds, rock, water, a height map for terrain, or a texture
 * for a shader to read.
 *
 * It **tiles without a seam**: the right edge runs on into the left one and the bottom into the top,
 * so a model can repeat it (`wrap: 'repeat'`) with no visible joins. For that, the blobs are fitted
 * to a whole number across the picture, so `scale` is followed as closely as that allows.
 *
 * @param pixels - The picture.
 * @param options - Which noise, how big and between which colours.
 * @returns The same picture, to go on painting.
 *
 * @example
 * ```ts
 * // A tiling rock texture for a model.
 * const rock = fillNoise(createPixels(64, 64), {
 *     seed: 7, scale: 16, octaves: 4, from: getColor('#2b2730'), to: getColor('#8a8090'),
 * });
 * createMaterial({ name: 'rock', shader: 'mesh3d', texture: createPixelTexture(rock), wrap: 'repeat' });
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillNoise = (pixels: TPixels, options: TFillNoiseOptions = {}): TPixels => {
    const seed = Math.floor(options.seed ?? 1);
    const octaves = Math.max(1, Math.floor(options.octaves ?? 1));
    const scale = Math.max(1, options.scale ?? 8);
    const low = bytesOf(options.from ?? { r: 0, g: 0, b: 0, a: 1 });
    const high = bytesOf(options.to ?? { r: 1, g: 1, b: 1, a: 1 });
    const { width, height } = pixels;

    // Each layer is a grid of random corners blended smoothly between, with the grid wrapping round
    // at the edges: that wrap is what makes the picture tile.
    const layers: { cellsX: number; cellsY: number; weight: number }[] = [];
    let total = 0;
    for (let o = 0; o < octaves; o++) {
        const size = scale / 2 ** o;
        const weight = 1 / 2 ** o;
        layers.push({ cellsX: Math.max(1, Math.round(width / size)), cellsY: Math.max(1, Math.round(height / size)), weight });
        total += weight;
    }

    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            let value = 0;
            for (let o = 0; o < layers.length; o++) {
                const { cellsX, cellsY, weight } = layers[o]!;
                const gx = ((px + 0.5) / width) * cellsX;
                const gy = ((py + 0.5) / height) * cellsY;
                const ix = Math.floor(gx);
                const iy = Math.floor(gy);
                const fx = gx - ix;
                const fy = gy - iy;
                const sx = fx * fx * (3 - 2 * fx);
                const sy = fy * fy * (3 - 2 * fy);
                const x0 = ix % cellsX;
                const y0 = iy % cellsY;
                const x1 = (ix + 1) % cellsX;
                const y1 = (iy + 1) % cellsY;
                const top = corner(x0, y0, seed, o) + (corner(x1, y0, seed, o) - corner(x0, y0, seed, o)) * sx;
                const bottom = corner(x0, y1, seed, o) + (corner(x1, y1, seed, o) - corner(x0, y1, seed, o)) * sx;
                value += (top + (bottom - top) * sy) * weight;
            }
            const t = value / total;
            put(
                pixels, px, py,
                Math.round(low[0] + (high[0] - low[0]) * t),
                Math.round(low[1] + (high[1] - low[1]) * t),
                Math.round(low[2] + (high[2] - low[2]) * t),
                Math.round(low[3] + (high[3] - low[3]) * t),
            );
        }
    }
    return pixels;
};

/**
 * Fills the picture with a checkerboard: the first texture every 3D scene is tried with, because it
 * shows at a glance whether a surface is stretched, mirrored or seen from the wrong side.
 *
 * @param pixels - The picture.
 * @param size - How many pixels wide one square is.
 * @param a - The colour of the top-left square.
 * @param b - The other colour.
 * @returns The same picture, to go on painting.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillChecker = (pixels: TPixels, size: number, a: TColor, b: TColor): TPixels => {
    const cell = Math.max(1, Math.floor(size));
    const first = bytesOf(a);
    const second = bytesOf(b);
    for (let py = 0; py < pixels.height; py++) {
        for (let px = 0; px < pixels.width; px++) {
            const [r, g, bl, al] = (Math.floor(px / cell) + Math.floor(py / cell)) % 2 === 0 ? first : second;
            put(pixels, px, py, r, g, bl, al);
        }
    }
    return pixels;
};

