import { bytesOf, put, toByte } from './bytes';
import type { TColor } from '../color';
import type { TPixels } from './types/t_pixels';

// Every function here writes the colour as it is, alpha included: nothing is blended, so painting a
// transparent colour cuts a hole. Only `blitPixels` lays one picture over another. Coordinates are
// whole pixels from the top-left corner; anything outside the picture is simply not drawn.

const inside = (pixels: TPixels, x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < pixels.width && y < pixels.height;

/**
 * Sets one pixel. Outside the picture it does nothing.
 *
 * @param pixels - The picture.
 * @param x - From the left edge, in pixels.
 * @param y - From the top edge, in pixels.
 * @param color - What it becomes, replacing what was there.
 * @returns The same picture, to go on painting.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setPixel = (pixels: TPixels, x: number, y: number, color: TColor): TPixels => {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (inside(pixels, px, py)) {
        put(pixels, px, py, toByte(color.r), toByte(color.g), toByte(color.b), toByte(color.a));
    }
    return pixels;
};

/**
 * Reads one pixel. Outside the picture it is fully transparent black.
 *
 * Reading the picture is also how a game asks questions of it: whether a pixel of a destructible
 * floor is still solid, which colour a minimap shows somewhere.
 *
 * @param pixels - The picture.
 * @param x - From the left edge, in pixels.
 * @param y - From the top edge, in pixels.
 * @returns Its colour, each channel from `0` to `1`.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getPixel = (pixels: TPixels, x: number, y: number): TColor => {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (!inside(pixels, px, py)) {
        return { r: 0, g: 0, b: 0, a: 0 };
    }
    const at = (py * pixels.width + px) * 4;
    const d = pixels.data;
    return { r: d[at]! / 255, g: d[at + 1]! / 255, b: d[at + 2]! / 255, a: d[at + 3]! / 255 };
};

/**
 * Fills a rectangle with one colour, cut to the picture's edges.
 *
 * @param pixels - The picture.
 * @param x - Its left edge.
 * @param y - Its top edge.
 * @param width - How wide, in pixels.
 * @param height - How tall, in pixels.
 * @param color - What it is filled with.
 * @returns The same picture, to go on painting.
 *
 * @example
 * ```ts
 * const bar = createPixels(64, 6, getColor('#200a0a'));
 * fillRect(bar, 1, 1, 40, 4, getColor('#e23d3d'));
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillRect = (pixels: TPixels, x: number, y: number, width: number, height: number, color: TColor): TPixels => {
    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const right = Math.min(pixels.width, Math.floor(x) + Math.floor(width));
    const bottom = Math.min(pixels.height, Math.floor(y) + Math.floor(height));
    const [r, g, b, a] = bytesOf(color);
    for (let py = top; py < bottom; py++) {
        for (let px = left; px < right; px++) {
            put(pixels, px, py, r, g, b, a);
        }
    }
    return pixels;
};

/**
 * Draws a line one pixel thick between two points, with the stepped edge of the era and no
 * smoothing: each pixel is either on the line or not.
 *
 * @param pixels - The picture.
 * @param x0 - Where it starts, from the left.
 * @param y0 - Where it starts, from the top.
 * @param x1 - Where it ends, from the left.
 * @param y1 - Where it ends, from the top.
 * @param color - Its colour.
 * @returns The same picture, to go on painting.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawLine = (pixels: TPixels, x0: number, y0: number, x1: number, y1: number, color: TColor): TPixels => {
    // Always drawn from the same end, the left one (the upper one for an upright line), so a line
    // from A to B and one from B to A are the same pixels: stepping the other way would settle the
    // ties between two equally near pixels the other way too.
    const swap = Math.round(x1) < Math.round(x0) || (Math.round(x1) === Math.round(x0) && Math.round(y1) < Math.round(y0));
    let x = Math.round(swap ? x1 : x0);
    let y = Math.round(swap ? y1 : y0);
    const endX = Math.round(swap ? x0 : x1);
    const endY = Math.round(swap ? y0 : y1);
    const dx = Math.abs(endX - x);
    const dy = -Math.abs(endY - y);
    const stepX = x < endX ? 1 : -1;
    const stepY = y < endY ? 1 : -1;
    const [r, g, b, a] = bytesOf(color);

    // Steps one pixel at a time along whichever axis is longer, keeping the error against the true
    // line in whole numbers, so the same two points always give the same pixels.
    let error = dx + dy;
    for (;;) {
        if (inside(pixels, x, y)) {
            put(pixels, x, y, r, g, b, a);
        }
        if (x === endX && y === endY) {
            break;
        }
        const twice = 2 * error;
        if (twice >= dy) {
            error += dy;
            x += stepX;
        }
        if (twice <= dx) {
            error += dx;
            y += stepY;
        }
    }
    return pixels;
};

/**
 * Fills a circle. Its edge is stepped, one pixel or none, the way a circle drawn by hand on a grid
 * looks, and it is exactly the edge `drawCircle` draws for the same radius.
 *
 * Painted with a transparent colour, it cuts a round hole: the crater in a destructible floor.
 *
 * @param pixels - The picture.
 * @param cx - Its centre, from the left.
 * @param cy - Its centre, from the top.
 * @param radius - In pixels. `0` is a single pixel.
 * @param color - What it is filled with.
 * @returns The same picture, to go on painting.
 *
 * @example
 * ```ts
 * const sun = createPixels(33, 33);
 * fillCircle(sun, 16, 16, 15, getColor('#ffd75a'));
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillCircle = (pixels: TPixels, cx: number, cy: number, radius: number, color: TColor): TPixels => {
    const x0 = Math.round(cx);
    const y0 = Math.round(cy);
    const r = Math.max(0, Math.round(radius));
    const [cr, cg, cb, ca] = bytesOf(color);

    // The edge is the one `drawCircle` draws, so a filled circle and an outline of the same radius
    // cover exactly the same pixels. How far each row reaches either side of the centre, by its
    // distance from the centre.
    const reach = new Array<number>(r + 1).fill(0);
    let x = r;
    let y = 0;
    let error = 1 - x;
    while (x >= y) {
        reach[y] = Math.max(reach[y]!, x);
        reach[x] = Math.max(reach[x]!, y);
        y++;
        if (error < 0) {
            error += 2 * y + 1;
        } else {
            x--;
            error += 2 * (y - x) + 1;
        }
    }

    for (let dy = -r; dy <= r; dy++) {
        const py = y0 + dy;
        if (py < 0 || py >= pixels.height) {
            continue;
        }
        const half = reach[Math.abs(dy)]!;
        const left = Math.max(0, x0 - half);
        const right = Math.min(pixels.width - 1, x0 + half);
        for (let px = left; px <= right; px++) {
            put(pixels, px, py, cr, cg, cb, ca);
        }
    }
    return pixels;
};

/**
 * Draws the outline of a circle, one pixel thick, with no gaps and no pixel drawn twice.
 *
 * @param pixels - The picture.
 * @param cx - Its centre, from the left.
 * @param cy - Its centre, from the top.
 * @param radius - In pixels.
 * @param color - Its colour.
 * @returns The same picture, to go on painting.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const drawCircle = (pixels: TPixels, cx: number, cy: number, radius: number, color: TColor): TPixels => {
    const x0 = Math.round(cx);
    const y0 = Math.round(cy);
    const [r, g, b, a] = bytesOf(color);
    const plot = (px: number, py: number): void => {
        if (inside(pixels, px, py)) {
            put(pixels, px, py, r, g, b, a);
        }
    };

    // One eighth of the circle is worked out and mirrored into the other seven, stepping outward in
    // whole pixels and choosing between two candidates by which is nearer the true edge.
    let x = Math.max(0, Math.round(radius));
    let y = 0;
    let error = 1 - x;
    while (x >= y) {
        plot(x0 + x, y0 + y); plot(x0 + y, y0 + x);
        plot(x0 - y, y0 + x); plot(x0 - x, y0 + y);
        plot(x0 - x, y0 - y); plot(x0 - y, y0 - x);
        plot(x0 + y, y0 - x); plot(x0 + x, y0 - y);
        y++;
        if (error < 0) {
            error += 2 * y + 1;
        } else {
            x--;
            error += 2 * (y - x) + 1;
        }
    }
    return pixels;
};

/**
 * Lays one picture over another, the way a sprite is drawn over a background: a transparent pixel
 * of `source` leaves what was there, an opaque one replaces it, and one in between mixes the two.
 *
 * It is how a sprite is put together from parts (a car from a body, wheels and a driver) or stamped
 * many times over a bigger picture.
 *
 * @param target - The picture drawn on.
 * @param source - The picture drawn.
 * @param x - Where `source`'s top-left corner lands in `target`.
 * @param y - Where `source`'s top-left corner lands in `target`.
 * @param options - `flipX` and `flipY` mirror `source` as it is drawn.
 * @returns `target`, to go on painting.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const blitPixels = (
    target: TPixels,
    source: TPixels,
    x: number,
    y: number,
    options: { flipX?: boolean; flipY?: boolean } = {},
): TPixels => {
    const ox = Math.floor(x);
    const oy = Math.floor(y);
    const src = source.data;
    const dst = target.data;
    for (let sy = 0; sy < source.height; sy++) {
        const ty = oy + sy;
        if (ty < 0 || ty >= target.height) {
            continue;
        }
        const ry = options.flipY === true ? source.height - 1 - sy : sy;
        for (let sx = 0; sx < source.width; sx++) {
            const tx = ox + sx;
            if (tx < 0 || tx >= target.width) {
                continue;
            }
            const rx = options.flipX === true ? source.width - 1 - sx : sx;
            const from = (ry * source.width + rx) * 4;
            const alpha = src[from + 3]!;
            if (alpha === 0) {
                continue;
            }
            const to = (ty * target.width + tx) * 4;
            if (alpha === 255) {
                dst[to] = src[from]!;
                dst[to + 1] = src[from + 1]!;
                dst[to + 2] = src[from + 2]!;
                dst[to + 3] = 255;
                continue;
            }
            // Straight alpha, the way every texture in the engine is kept.
            const a = alpha / 255;
            const under = dst[to + 3]! / 255;
            const out = a + under * (1 - a);
            for (let c = 0; c < 3; c++) {
                dst[to + c] = Math.round((src[from + c]! * a + dst[to + c]! * under * (1 - a)) / out);
            }
            dst[to + 3] = Math.round(out * 255);
        }
    }
    return target;
};

/**
 * Works out every pixel again from what it is and where it is: for anything the other functions do
 * not draw. A recolour, a shading by height, a pattern of your own.
 *
 * @param pixels - The picture.
 * @param fn - Given each pixel's colour and position, returns what it becomes.
 * @returns The same picture, to go on painting.
 *
 * @example
 * ```ts
 * // Brick: rows of 8 pixels, every other row shifted by half a brick, with a darker mortar line.
 * mapPixels(wall, (color, x, y) =>
 *     y % 8 === 0 || (x + (Math.floor(y / 8) % 2) * 8) % 16 === 0 ? mortar : brick);
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mapPixels = (pixels: TPixels, fn: (color: TColor, x: number, y: number) => TColor): TPixels => {
    const d = pixels.data;
    for (let py = 0; py < pixels.height; py++) {
        for (let px = 0; px < pixels.width; px++) {
            const at = (py * pixels.width + px) * 4;
            const next = fn({ r: d[at]! / 255, g: d[at + 1]! / 255, b: d[at + 2]! / 255, a: d[at + 3]! / 255 }, px, py);
            d[at] = toByte(next.r);
            d[at + 1] = toByte(next.g);
            d[at + 2] = toByte(next.b);
            d[at + 3] = toByte(next.a);
        }
    }
    return pixels;
};
