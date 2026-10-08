import { BLUE, GREEN, RED, edgeDistance, edgeOf, pseudoDistance } from './edges';
import { colorEdges } from './color_edges';
import { DISTANCE_FIELD_RANGE } from '../../../render/shared/distance_field';
import type { TEdge, TEdgeDistance } from './edges';
import type { TOutline } from '../sfnt/t_outline';

/**
 * How many pixels of the atlas the distance field spans, edge to fully in or fully out, split evenly
 * either side of the outline. The same constant the shaders are written with.
 *
 * @internal
 */
export const MSDF_RANGE = DISTANCE_FIELD_RANGE;

/**
 * One glyph's distance field, and where its picture sits against the pen.
 *
 * @internal
 */
export type TGlyphField = {
    width: number;
    height: number;
    /**
     * `width * height` RGBA pixels, row 0 at the top. Alpha is always opaque.
     */
    data: Uint8Array;
    /**
     * From the pen to the picture's left edge, in atlas pixels.
     */
    left: number;
    /**
     * From the baseline up to the picture's top edge, in atlas pixels.
     */
    top: number;
};

/**
 * Whether a sideways line from the point to the right crosses the outline more times one way than
 * the other: inside, by the rule TrueType fills with.
 *
 * Each edge is taken in parts that only go up or only go down (a curve turns back at most once), and
 * a part counts when the point's height is in `[low, high)`: half-open, so where two edges meet the
 * crossing is counted once.
 */
const isInside = (edges: readonly TEdge[], px: number, py: number): boolean => {
    let winding = 0;
    for (const edge of edges) {
        // Not level with it (the top itself never counts, being the open end), or wholly to the left:
        // no crossing to the right.
        if (py < edge.minY || py >= edge.maxY || edge.maxX <= px) {
            continue;
        }
        if (!edge.curved) {
            const { y0, y1 } = edge;
            const up = y0 <= py && py < y1;
            if (up || (y1 <= py && py < y0)) {
                const x = edge.x0 + ((py - y0) / (y1 - y0)) * (edge.x1 - edge.x0);
                if (x > px) {
                    winding += up ? 1 : -1;
                }
            }
            continue;
        }
        const a = edge.y0 - 2 * edge.cy + edge.y1;
        const b = 2 * (edge.cy - edge.y0);
        const flat = Math.abs(a) < 1e-12;
        const turn = flat ? -1 : -b / (2 * a);
        if (turn > 0 && turn < 1) {
            winding += crossing(edge, a, b, px, py, 0, turn) + crossing(edge, a, b, px, py, turn, 1);
        } else {
            winding += crossing(edge, a, b, px, py, 0, 1);
        }
    }
    return winding !== 0;
};

/**
 * The crossing, if any, of one part of a curve that only goes one way vertically, between `ta` and
 * `tb`: `+1` going up, `-1` going down, `0` none or to the left.
 */
const crossing = (edge: TEdge, a: number, b: number, px: number, py: number, ta: number, tb: number): number => {
    const ya = yAt(edge, ta);
    const yb = yAt(edge, tb);
    const up = ya <= py && py < yb;
    if (!up && !(yb <= py && py < ya)) {
        return 0;
    }
    return xAtHeight(edge, a, b, py, ta, tb) > px ? (up ? 1 : -1) : 0;
};

const yAt = (edge: TEdge, t: number): number => {
    const u = 1 - t;
    return u * u * edge.y0 + 2 * u * t * edge.cy + t * t * edge.y1;
};

/**
 * Which pixels of one row are inside the outline, all at once: every crossing of the row is found
 * once, and the pixels are walked from the right adding up the crossings passed. The same rule as
 * `isInside`, for a whole row at the cost of one point.
 */
const insideRow = (edges: readonly TEdge[], py: number, fieldX: (column: number) => number, width: number, out: Uint8Array): void => {
    const crossings: number[] = [];
    for (const edge of edges) {
        if (py < edge.minY || py >= edge.maxY) {
            continue;
        }
        if (!edge.curved) {
            const { y0, y1 } = edge;
            const up = y0 <= py && py < y1;
            if (up || (y1 <= py && py < y0)) {
                crossings.push(edge.x0 + ((py - y0) / (y1 - y0)) * (edge.x1 - edge.x0), up ? 1 : -1);
            }
            continue;
        }
        const a = edge.y0 - 2 * edge.cy + edge.y1;
        const b = 2 * (edge.cy - edge.y0);
        const turn = Math.abs(a) < 1e-12 ? -1 : -b / (2 * a);
        if (turn > 0 && turn < 1) {
            crossingAt(edge, a, b, py, 0, turn, crossings);
            crossingAt(edge, a, b, py, turn, 1, crossings);
        } else {
            crossingAt(edge, a, b, py, 0, 1, crossings);
        }
    }
    for (let column = 0; column < width; column++) {
        const px = fieldX(column);
        let winding = 0;
        for (let i = 0; i < crossings.length; i += 2) {
            if (crossings[i]! > px) {
                winding += crossings[i + 1]!;
            }
        }
        out[column] = winding !== 0 ? 1 : 0;
    }
};

/**
 * Where one one-way part of a curve crosses the height `py`, pushed as `x, direction` onto `out`.
 */
const crossingAt = (edge: TEdge, a: number, b: number, py: number, ta: number, tb: number, out: number[]): void => {
    const ya = yAt(edge, ta);
    const yb = yAt(edge, tb);
    const up = ya <= py && py < yb;
    if (!up && !(yb <= py && py < ya)) {
        return;
    }
    out.push(xAtHeight(edge, a, b, py, ta, tb), up ? 1 : -1);
};

/**
 * Where a curve is at height `py`, between `ta` and `tb`, along which it only goes one way.
 */
const xAtHeight = (edge: TEdge, a: number, b: number, py: number, ta: number, tb: number): number => {
    let t: number;
    const c = edge.y0 - py;
    if (Math.abs(a) < 1e-12) {
        t = Math.abs(b) < 1e-12 ? (ta + tb) / 2 : -c / b;
    } else {
        const root = Math.sqrt(Math.max(0, b * b - 4 * a * c));
        const t1 = (-b + root) / (2 * a);
        t = t1 >= ta - 1e-9 && t1 <= tb + 1e-9 ? t1 : (-b - root) / (2 * a);
    }
    const u = 1 - t;
    return u * u * edge.x0 + 2 * u * t * edge.cx + t * t * edge.x1;
};

const median = (a: number, b: number, c: number): number => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

/**
 * How far a point is from the nearest part of an edge's box: never more than the distance to the
 * edge itself, so an edge whose box is further than what has been found already can be skipped.
 */
const boxDistance = (edge: TEdge, px: number, py: number): number => {
    const dx = Math.max(edge.minX - px, 0, px - edge.maxX);
    const dy = Math.max(edge.minY - py, 0, py - edge.maxY);
    return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Whether two neighbouring pixels disagree so much in two channels that the median between them
 * would invent an edge that is not there. Only the one further from a real edge is flagged.
 */
const clashes = (field: Float32Array, ai: number, bi: number, threshold: number): boolean => {
    let a0 = field[ai]!; let a1 = field[ai + 1]!; let a2 = field[ai + 2]!;
    let b0 = field[bi]!; let b1 = field[bi + 1]!; let b2 = field[bi + 2]!;
    let swap: number;
    // Ordered so the pair that differs most comes first.
    if (Math.abs(b0 - a0) < Math.abs(b1 - a1)) { swap = a0; a0 = a1; a1 = swap; swap = b0; b0 = b1; b1 = swap; }
    if (Math.abs(b1 - a1) < Math.abs(b2 - a2)) {
        swap = a1; a1 = a2; a2 = swap; swap = b1; b1 = b2; b2 = swap;
        if (Math.abs(b0 - a0) < Math.abs(b1 - a1)) { swap = a0; a0 = a1; a1 = swap; swap = b0; b0 = b1; b1 = swap; }
    }
    return Math.abs(b1 - a1) >= threshold
        && !(b0 === b1 && b0 === b2)
        && Math.abs(a2 - 0.5) >= Math.abs(b2 - 0.5);
};

/**
 * The eight neighbours of a pixel, and whether each is diagonal.
 */
const AROUND = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]];

/**
 * Where to read between pixels, as fractions of the way across a cell of four.
 */
const READS = [1 / 6, 0.5, 5 / 6];

/**
 * The plain distance from a point to the outline, in font units, signed by inside and outside.
 */
const trueDistance = (edges: readonly TEdge[], px: number, py: number, found: TEdgeDistance): number => {
    let nearest = Infinity;
    for (const edge of edges) {
        if (boxDistance(edge, px, py) >= nearest) {
            continue;
        }
        edgeDistance(edge, px, py, found);
        nearest = Math.min(nearest, Math.abs(found.distance));
    }
    return isInside(edges, px, py) ? nearest : -nearest;
};

/**
 * Draws one glyph's multi-channel distance field.
 *
 * Each pixel holds, in each of red, green and blue, how far its centre is from the nearest edge of
 * that channel's colour, scaled so 0.5 is on the outline, above is inside and the field runs out
 * `MSDF_RANGE` pixels across. The shader takes the median of the three: one channel alone would round
 * every corner off, and three that disagree only near corners keep them square at any size.
 *
 * Then three passes put right what the method gets wrong on real fonts:
 *
 * - A pixel whose median says inside where the outline says outside (a loop drawn the wrong way
 *   round, or two loops overlapping) is turned over.
 * - Pixels whose channels clash with a neighbour's are flattened to their median, so no stray edge
 *   appears between them.
 * - The field is read between pixels, the way the screen will read it. Where that puts a point that
 *   is clearly inside the outline outside (a bite out of a stroke) or the other way round (a speck
 *   beside it), the four pixels around it are given the plain distance to the outline instead. A
 *   real corner is never touched: away from the outline it reads the right way round.
 *
 * @param outline The glyph, in font units, y up.
 * @param scale Atlas pixels per font unit.
 * @returns The picture and where it sits, or `null` for a glyph with nothing to draw (a space).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const generateMsdf = (outline: TOutline, scale: number): TGlyphField | null => {
    const edges = outline.flatMap((loop) => colorEdges(loop.map((segment) => edgeOf(segment))));
    if (edges.length === 0) {
        return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const edge of edges) {
        minX = Math.min(minX, edge.minX);
        maxX = Math.max(maxX, edge.maxX);
        minY = Math.min(minY, edge.minY);
        maxY = Math.max(maxY, edge.maxY);
    }
    const pad = Math.ceil(MSDF_RANGE / 2) + 1;
    const left = Math.floor(minX * scale) - pad;
    const top = Math.ceil(maxY * scale) + pad;
    const width = Math.ceil(maxX * scale) + pad - left;
    const height = top - (Math.floor(minY * scale) - pad);
    const fieldX = (column: number): number => (left + column + 0.5) / scale;
    const fieldY = (row: number): number => (top - row - 0.5) / scale;

    // How far from an edge its distance still matters: past half the range a channel reads fully in
    // or fully out whichever edge is nearest. Each edge is measured only against the pixels this
    // close to its box, which is every pixel whose answer it could change, and far fewer than all.
    const reach = MSDF_RANGE / scale;
    const count = width * height;
    const best = new Float64Array(count * 3).fill(Infinity);
    const bestDot = new Float64Array(count * 3);
    const bestT = new Float64Array(count * 3);
    const bestEdge = new Int32Array(count * 3).fill(-1);
    const found: TEdgeDistance = { distance: 0, dot: 0, t: 0 };
    const channels = [RED, GREEN, BLUE];

    edges.forEach((edge, index) => {
        const firstColumn = Math.max(0, Math.floor((edge.minX - reach) * scale - left));
        const lastColumn = Math.min(width - 1, Math.ceil((edge.maxX + reach) * scale - left));
        const firstRow = Math.max(0, Math.floor(top - (edge.maxY + reach) * scale));
        const lastRow = Math.min(height - 1, Math.ceil(top - (edge.minY - reach) * scale));
        for (let row = firstRow; row <= lastRow; row++) {
            const fy = fieldY(row);
            for (let column = firstColumn; column <= lastColumn; column++) {
                const fx = fieldX(column);
                edgeDistance(edge, fx, fy, found);
                const size = Math.abs(found.distance);
                const at = (row * width + column) * 3;
                for (let c = 0; c < 3; c++) {
                    if ((edge.color & channels[c]!) === 0) {
                        continue;
                    }
                    const held = Math.abs(best[at + c]!);
                    if (size < held || (size === held && found.dot < bestDot[at + c]!)) {
                        best[at + c] = found.distance;
                        bestDot[at + c] = found.dot;
                        bestT[at + c] = found.t;
                        bestEdge[at + c] = index;
                    }
                }
            }
        }
    });

    const field = new Float32Array(count * 3);
    const kept: TEdgeDistance = { distance: 0, dot: 0, t: 0 };
    const inside = new Uint8Array(width);
    for (let row = 0; row < height; row++) {
        const fy = fieldY(row);
        // The outline decides inside and outside; the field only says how far.
        insideRow(edges, fy, fieldX, width, inside);
        for (let column = 0; column < width; column++) {
            const fx = fieldX(column);
            const at = (row * width + column) * 3;
            const within = inside[column] === 1;
            for (let c = 0; c < 3; c++) {
                const index = bestEdge[at + c]!;
                if (index < 0) {
                    // No edge of this colour within reach: fully in or fully out, as the outline says.
                    field[at + c] = within ? 1 : 0;
                    continue;
                }
                kept.distance = best[at + c]!;
                kept.dot = bestDot[at + c]!;
                kept.t = bestT[at + c]!;
                field[at + c] = (pseudoDistance(edges[index]!, fx, fy, kept) * scale) / MSDF_RANGE + 0.5;
            }
            if ((median(field[at]!, field[at + 1]!, field[at + 2]!) > 0.5) !== within) {
                field[at] = 1 - field[at]!;
                field[at + 1] = 1 - field[at + 1]!;
                field[at + 2] = 1 - field[at + 2]!;
            }
        }
    }

    // Flatten the pixels whose channels would draw an edge between them and a neighbour that is not
    // in the outline. A diagonal neighbour is further away, so it is allowed to differ by more.
    const threshold = 1.001 / MSDF_RANGE;
    const flagged: number[] = [];
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            const at = (row * width + column) * 3;
            for (const [dx, dy, diagonal] of AROUND) {
                const x = column + dx!;
                const y = row + dy!;
                if (x >= 0 && x < width && y >= 0 && y < height
                    && clashes(field, at, (y * width + x) * 3, diagonal === 1 ? threshold * Math.SQRT2 : threshold)) {
                    flagged.push(at);
                    break;
                }
            }
        }
    }
    for (const at of flagged) {
        const value = median(field[at]!, field[at + 1]!, field[at + 2]!);
        field[at] = field[at + 1] = field[at + 2] = value;
    }

    correctBetweenPixels(field, width, height, fieldX, fieldY, edges, scale, found);

    const data = new Uint8Array(width * height * 4);
    for (let i = 0, o = 0; i < field.length; i += 3, o += 4) {
        for (let c = 0; c < 3; c++) {
            const value = field[i + c]!;
            data[o + c] = value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255);
        }
        data[o + 3] = 255;
    }
    return { width, height, data, left, top };
};

/**
 * Reads the field between its pixels, the way the screen will, and where it draws an edge the
 * outline does not have, puts the plain distance into the four pixels around it. Twice over, because
 * a fix can move a problem one cell along.
 *
 * Cheap where it can be: a cell whose four pixels and nine reads all agree is skipped without asking
 * the outline anything, and that is every cell but the few an edge runs through.
 */
const correctBetweenPixels = (
    field: Float32Array,
    width: number,
    height: number,
    fieldX: (column: number) => number,
    fieldY: (row: number) => number,
    edges: readonly TEdge[],
    scale: number,
    found: TEdgeDistance,
): void => {
    // A third of a pixel of the field: closer than that to the outline, reading either way is fair.
    const margin = 0.3 / scale;
    const stepX = fieldX(1) - fieldX(0);
    const stepY = fieldY(1) - fieldY(0);
    const sides: boolean[] = new Array(READS.length * READS.length);

    for (let pass = 0; pass < 2; pass++) {
        const marked = new Set<number>();
        for (let row = 0; row + 1 < height; row++) {
            for (let column = 0; column + 1 < width; column++) {
                const a = (row * width + column) * 3;
                const b = a + 3;
                const c = a + width * 3;
                const d = c + 3;
                const corner = median(field[a]!, field[a + 1]!, field[a + 2]!) > 0.5;
                let mixed = (median(field[b]!, field[b + 1]!, field[b + 2]!) > 0.5) !== corner
                    || (median(field[c]!, field[c + 1]!, field[c + 2]!) > 0.5) !== corner
                    || (median(field[d]!, field[d + 1]!, field[d + 2]!) > 0.5) !== corner;
                let i = 0;
                for (const v of READS) {
                    for (const u of READS) {
                        const wa = (1 - u) * (1 - v);
                        const wb = u * (1 - v);
                        const wc = (1 - u) * v;
                        const wd = u * v;
                        const side = median(
                            field[a]! * wa + field[b]! * wb + field[c]! * wc + field[d]! * wd,
                            field[a + 1]! * wa + field[b + 1]! * wb + field[c + 1]! * wc + field[d + 1]! * wd,
                            field[a + 2]! * wa + field[b + 2]! * wb + field[c + 2]! * wc + field[d + 2]! * wd,
                        ) > 0.5;
                        sides[i++] = side;
                        mixed ||= side !== corner;
                    }
                }
                if (!mixed) {
                    continue;
                }
                let wrong = false;
                i = 0;
                for (let vi = 0; vi < READS.length && !wrong; vi++) {
                    for (let ui = 0; ui < READS.length && !wrong; ui++) {
                        const fx = fieldX(column) + READS[ui]! * stepX;
                        const fy = fieldY(row) + READS[vi]! * stepY;
                        if (isInside(edges, fx, fy) !== sides[i++]) {
                            wrong = Math.abs(trueDistance(edges, fx, fy, found)) > margin;
                        }
                    }
                }
                if (wrong) {
                    marked.add(a / 3).add(b / 3).add(c / 3).add(d / 3);
                }
            }
        }
        if (marked.size === 0) {
            return;
        }
        for (const index of marked) {
            const fx = fieldX(index % width);
            const fy = fieldY(Math.floor(index / width));
            const value = (trueDistance(edges, fx, fy, found) * scale) / MSDF_RANGE + 0.5;
            field[index * 3] = field[index * 3 + 1] = field[index * 3 + 2] = value;
        }
    }
};
