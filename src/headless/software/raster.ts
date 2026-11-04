/**
 * The few things every picture drawn without a graphics card is made of: reading a picture as the
 * card reads one, laying a colour over a pixel as the card blends, and finding which pixels a
 * triangle covers by the card's own rule. Each is written to give the answer the card gives, so a
 * picture taken this way matches the one on the screen wherever pixel art is drawn at whole pixels.
 */

/**
 * A picture in memory: four bytes a pixel, red, green, blue and alpha, row 0 at the top.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPicture = { width: number; height: number; data: Uint8Array };

/**
 * A colour being worked out, each channel from 0 to 1. Reused rather than made per pixel.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRgba = [number, number, number, number];

/**
 * How far a read may be from the line between two texels and still be taken as on it. The same
 * nudge both cards make (`offTheSeam`), so a read that lands exactly between two texels takes the
 * one after it everywhere.
 */
const SEAM = 4e-6;

/**
 * A read moved just past the line between two texels when it lands on one, as the cards do.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const offTheSeam = (read: number, texels: number): number => {
    const seam = Math.floor(read * texels + 0.5) / texels;
    return Math.abs(read - seam) < SEAM ? seam + SEAM : read;
};

const clampIndex = (value: number, size: number): number => (value < 0 ? 0 : value >= size ? size - 1 : value);

/**
 * Reads `picture` at `u`, `v` (0 to 1 across it) into `out`: the nearest texel, or the four around
 * it mixed when `smooth`, with the edge held for anything outside, as a card reads with its
 * addressing clamped to the edge.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sample = (picture: TPicture, u: number, v: number, smooth: boolean, out: TRgba): TRgba => {
    const { width, height, data } = picture;
    // A picture nothing has been drawn into yet, or a read from nowhere (a corner placed at no
    // number at all), reads as nothing, as an empty picture on the card does.
    if (data.length < width * height * 4 || !Number.isFinite(u) || !Number.isFinite(v)) {
        out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0;
        return out;
    }
    if (!smooth) {
        const x = clampIndex(Math.floor(u * width), width);
        const y = clampIndex(Math.floor(v * height), height);
        const at = (y * width + x) * 4;
        out[0] = data[at]! / 255;
        out[1] = data[at + 1]! / 255;
        out[2] = data[at + 2]! / 255;
        out[3] = data[at + 3]! / 255;
        return out;
    }
    const fx = u * width - 0.5;
    const fy = v * height - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const xa = clampIndex(x0, width);
    const xb = clampIndex(x0 + 1, width);
    const ya = clampIndex(y0, height);
    const yb = clampIndex(y0 + 1, height);
    for (let c = 0; c < 4; c++) {
        const top = data[(ya * width + xa) * 4 + c]! * (1 - tx) + data[(ya * width + xb) * 4 + c]! * tx;
        const bottom = data[(yb * width + xa) * 4 + c]! * (1 - tx) + data[(yb * width + xb) * 4 + c]! * tx;
        out[c] = (top * (1 - ty) + bottom * ty) / 255;
    }
    return out;
};

/**
 * How a colour is laid over what is there, in the card's terms:
 *
 * - `'alpha'`: over it by its alpha (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`, alpha `ONE,
 *   ONE_MINUS_SRC_ALPHA`), what sprites, maps and particles are drawn with.
 * - `'additive'`: added by its alpha, the alpha left as it was (`SRC_ALPHA, ONE`, alpha `ZERO, ONE`).
 * - `'premultiplied'`: a colour already multiplied by its alpha, over it (`ONE,
 *   ONE_MINUS_SRC_ALPHA`): a picture drawn into before, laid back over the pass.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBlend = 'alpha' | 'additive' | 'premultiplied';

const toByte = (value: number): number => (value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255));

/**
 * Lays `color` over the pixel at `at` (its first byte) of `target`, kept to bytes as a card keeps a
 * picture of eight bits a channel.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const blend = (target: Uint8Array, at: number, color: TRgba, how: TBlend): void => {
    const [r, g, b, a] = color;
    // A colour that is no number (a tint of NaN) lays nothing, rather than cutting a hole.
    if (Number.isNaN(r + g + b + a)) {
        return;
    }
    const dr = target[at]! / 255;
    const dg = target[at + 1]! / 255;
    const db = target[at + 2]! / 255;
    const da = target[at + 3]! / 255;
    if (how === 'additive') {
        target[at] = toByte(r * a + dr);
        target[at + 1] = toByte(g * a + dg);
        target[at + 2] = toByte(b * a + db);
        return;
    }
    const keep = 1 - a;
    const times = how === 'premultiplied' ? 1 : a;
    target[at] = toByte(r * times + dr * keep);
    target[at + 1] = toByte(g * times + dg * keep);
    target[at + 2] = toByte(b * times + db * keep);
    target[at + 3] = toByte(a + da * keep);
};

/**
 * A corner of a triangle on the target, in its pixels, with what is carried across it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCorner = { x: number; y: number };

/**
 * The part of the target a draw may touch, in whole pixels, right and bottom left out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBounds = { left: number; top: number; right: number; bottom: number };

/**
 * Where a corner lands once a card has placed it: on a grid of 256ths of a pixel, which is how
 * finely a card holds a corner's place before it decides what a triangle covers.
 */
const SUBPIXEL = 256;
const snap = (value: number): number => Math.round(value * SUBPIXEL) / SUBPIXEL;

/**
 * Calls `cover` for every pixel whose middle the triangle `a`, `b`, `c` covers, inside `bounds`,
 * with how much of each corner is in that pixel (the three add up to one).
 *
 * A middle exactly on an edge is covered when the edge is the triangle's top or its left, the rule
 * a card keeps so two triangles sharing an edge never both cover a pixel on it, nor both leave it.
 * Without it a see-through shape made of triangles would show its seams darker, and a sprite whose
 * edge falls on half a pixel would come out a pixel wider than on the screen.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const coverTriangle = (
    a: TCorner,
    b: TCorner,
    c: TCorner,
    bounds: TBounds,
    cover: (x: number, y: number, wa: number, wb: number, wc: number) => void,
): void => {
    let ax = snap(a.x), ay = snap(a.y);
    let bx = snap(b.x), by = snap(b.y);
    let cx = snap(c.x), cy = snap(c.y);
    let area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (!(Math.abs(area) > 0)) {
        return;
    }
    // One way round, so "inside" is the same sign for every edge. The weights follow the corners.
    let flipped = false;
    if (area < 0) {
        [bx, cx] = [cx, bx];
        [by, cy] = [cy, by];
        area = -area;
        flipped = true;
    }
    const left = Math.max(bounds.left, Math.floor(Math.min(ax, bx, cx)));
    const right = Math.min(bounds.right, Math.ceil(Math.max(ax, bx, cx)));
    const top = Math.max(bounds.top, Math.floor(Math.min(ay, by, cy)));
    const bottom = Math.min(bounds.bottom, Math.ceil(Math.max(ay, by, cy)));
    if (left >= right || top >= bottom) {
        return;
    }
    // With y growing downwards and this winding, an edge is the top when it runs flat to the right,
    // and the left when it runs upwards.
    const topLeft = (dx: number, dy: number): boolean => dy < 0 || (dy === 0 && dx > 0);
    const edgeBc = topLeft(cx - bx, cy - by);
    const edgeCa = topLeft(ax - cx, ay - cy);
    const edgeAb = topLeft(bx - ax, by - ay);
    const inside = (value: number, isTopLeft: boolean): boolean => value > 0 || (value === 0 && isTopLeft);

    for (let y = top; y < bottom; y++) {
        const py = y + 0.5;
        for (let x = left; x < right; x++) {
            const px = x + 0.5;
            const wa = (cx - bx) * (py - by) - (cy - by) * (px - bx);
            const wb = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
            const wc = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
            if (!inside(wa, edgeBc) || !inside(wb, edgeCa) || !inside(wc, edgeAb)) {
                continue;
            }
            if (flipped) {
                cover(x, y, wa / area, wc / area, wb / area);
            } else {
                cover(x, y, wa / area, wb / area, wc / area);
            }
        }
    }
};
