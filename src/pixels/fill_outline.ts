import type { TColor } from '../color';
import type { TPixels } from './types/t_pixels';

/**
 * A closed shape as the corners of its outline, `x, y, x, y, …`, in pixels of the picture. The last
 * corner joins back to the first.
 *
 * @internal
 */
export type TPolygon = number[];

/**
 * Samples per pixel along each side when the edge is smoothed: sixteen in all, which tells seventeen
 * shades of an edge apart. Enough that a letter's curve looks round, few enough to stay quick.
 */
const SMOOTH_SAMPLES = 4;

/**
 * Lays `color` over one pixel as far as `cover` says (0 to 1), the way `blitPixels` lays a picture:
 * straight alpha, what was there showing through what is not opaque.
 */
const cover = (pixels: TPixels, x: number, y: number, color: TColor, amount: number): void => {
    const a = color.a * amount;
    if (a <= 0) {
        return;
    }
    const data = pixels.data;
    const at = (y * pixels.width + x) * 4;
    const under = data[at + 3]! / 255;
    const out = a + under * (1 - a);
    data[at] = Math.round((color.r * 255 * a + data[at]! * under * (1 - a)) / out);
    data[at + 1] = Math.round((color.g * 255 * a + data[at + 1]! * under * (1 - a)) / out);
    data[at + 2] = Math.round((color.b * 255 * a + data[at + 2]! * under * (1 - a)) / out);
    data[at + 3] = Math.round(out * 255);
};

/**
 * Fills the inside of one or more outlines: the letters of a text in a vector font.
 *
 * Inside is decided the way fonts expect, by which way the outlines wind (non-zero): the hole of an
 * O is drawn the other way round from its outside, so it stays empty, and two letters that touch are
 * one shape rather than drawn twice where they meet.
 *
 * Smoothed, each pixel is covered as far as the shape covers it, from a grid of samples inside it;
 * not smoothed, a pixel is in or out by its centre, which is how pixel art wants its edges.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillOutline = (pixels: TPixels, polygons: readonly TPolygon[], color: TColor, smooth: boolean): TPixels => {
    // Every edge that is not flat, kept as where it starts going down the picture, where it ends,
    // and which way it went: up the picture counts one way round the shape, down the other.
    const edges: number[] = [];
    let top = Infinity;
    let bottom = -Infinity;
    for (const polygon of polygons) {
        const corners = polygon.length / 2;
        for (let i = 0; i < corners; i++) {
            const x0 = polygon[i * 2]!;
            const y0 = polygon[i * 2 + 1]!;
            const j = (i + 1) % corners;
            const x1 = polygon[j * 2]!;
            const y1 = polygon[j * 2 + 1]!;
            if (y0 === y1) {
                continue;
            }
            const down = y1 > y0;
            edges.push(down ? x0 : x1, down ? y0 : y1, down ? x1 : x0, down ? y1 : y0, down ? 1 : -1);
            top = Math.min(top, y0, y1);
            bottom = Math.max(bottom, y0, y1);
        }
    }
    if (edges.length === 0) {
        return pixels;
    }

    const samples = smooth ? SMOOTH_SAMPLES : 1;
    const weight = 1 / (samples * samples);
    const firstRow = Math.max(0, Math.floor(top));
    const lastRow = Math.min(pixels.height - 1, Math.ceil(bottom));
    const coverage = new Float32Array(pixels.width);
    const crossings: Array<{ x: number; winding: number }> = [];

    for (let row = firstRow; row <= lastRow; row++) {
        coverage.fill(0);
        let touched = false;
        for (let sub = 0; sub < samples; sub++) {
            const y = row + (sub + 0.5) / samples;
            crossings.length = 0;
            for (let e = 0; e < edges.length; e += 5) {
                const y0 = edges[e + 1]!;
                const y1 = edges[e + 3]!;
                // Half open, so a corner where two edges meet is crossed once and not twice.
                if (y < y0 || y >= y1) {
                    continue;
                }
                const x0 = edges[e]!;
                const x1 = edges[e + 2]!;
                crossings.push({ x: x0 + ((y - y0) * (x1 - x0)) / (y1 - y0), winding: edges[e + 4]! });
            }
            if (crossings.length < 2) {
                continue;
            }
            crossings.sort((a, b) => a.x - b.x);

            // Between two crossings the shape is inside wherever the windings so far do not cancel.
            let winding = 0;
            for (let c = 0; c < crossings.length - 1; c++) {
                winding += crossings[c]!.winding;
                if (winding === 0) {
                    continue;
                }
                // The samples along the row sit at `(k + 0.5) / samples`: the ones inside [from, to).
                const from = Math.max(0, Math.ceil(crossings[c]!.x * samples - 0.5));
                const to = Math.min(pixels.width * samples, Math.ceil(crossings[c + 1]!.x * samples - 0.5));
                for (let k = from; k < to; k++) {
                    coverage[Math.floor(k / samples)]! += weight;
                    touched = true;
                }
            }
        }
        if (!touched) {
            continue;
        }
        for (let x = 0; x < pixels.width; x++) {
            const amount = coverage[x]!;
            if (amount > 0) {
                cover(pixels, x, row, color, Math.min(1, amount));
            }
        }
    }
    return pixels;
};
