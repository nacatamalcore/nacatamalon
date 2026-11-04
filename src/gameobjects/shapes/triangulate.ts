type TPoint = { x: number; y: number };

/** How much `b` turns left going from `a` to `c`: twice the area of the three, signed. */
const turnOf = (a: TPoint, b: TPoint, c: TPoint): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const same = (a: TPoint, b: TPoint): boolean => a.x === b.x && a.y === b.y;

/** Whether two sides share any point, ends included. */
const touch = (a: TPoint, b: TPoint, c: TPoint, d: TPoint): boolean => {
    const d1 = turnOf(c, d, a);
    const d2 = turnOf(c, d, b);
    const d3 = turnOf(a, b, c);
    const d4 = turnOf(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
    }
    const within = (p: TPoint, q: TPoint, r: TPoint): boolean =>
        Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
    return (d1 === 0 && within(c, d, a)) || (d2 === 0 && within(c, d, b)) || (d3 === 0 && within(a, b, c)) || (d4 === 0 && within(a, b, d));
};

/**
 * Cuts an outline into triangles, three corners each, as places in `points`: any outline that does
 * not cross itself, hollowed in or not, either way round. A corner repeated straight after itself,
 * or one on the straight line between its neighbours, is passed over.
 *
 * `null` when the outline crosses or touches itself, which has no inside to cut: the caller draws
 * it some other way. An empty list when it has no inside at all (a line, a point).
 *
 * Each triangle is the corner cut off where two sides meet with nothing else inside them (an ear),
 * one at a time until three are left.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const triangulate = (points: ReadonlyArray<TPoint>): number[] | null => {
    const index: number[] = [];
    for (let i = 0; i < points.length; i++) {
        const p = points[i]!;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            return null;
        }
        if (index.length === 0 || !same(points[index[index.length - 1]!]!, p)) {
            index.push(i);
        }
    }
    while (index.length > 1 && same(points[index[0]!]!, points[index[index.length - 1]!]!)) {
        index.pop();
    }
    if (index.length < 3) {
        return [];
    }

    // Two sides that are not neighbours and meet: no inside to cut, even when what it closes adds
    // up to nothing, as a bow tie's two halves do.
    const count = index.length;
    for (let i = 0; i < count; i++) {
        const a = points[index[i]!]!;
        const b = points[index[(i + 1) % count]!]!;
        for (let j = i + 2; j < count; j++) {
            if (i === 0 && j === count - 1) {
                continue;
            }
            if (touch(a, b, points[index[j]!]!, points[index[(j + 1) % count]!]!)) {
                return null;
            }
        }
    }

    let area = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    // Measured from the first corner, so an outline far from the origin keeps its digits.
    const origin = points[index[0]!]!;
    for (let k = 0; k < index.length; k++) {
        const a = points[index[k]!]!;
        const b = points[index[(k + 1) % index.length]!]!;
        area += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
        minX = Math.min(minX, a.x);
        minY = Math.min(minY, a.y);
        maxX = Math.max(maxX, a.x);
        maxY = Math.max(maxY, a.y);
    }
    // What counts as no turn at all, for this outline's size: the sums above are not exact.
    const size = Math.max(maxX - minX, maxY - minY);
    const flat = size * size * 1e-10;
    if (Math.abs(area) <= flat) {
        return [];
    }
    const way = area > 0 ? 1 : -1;

    const out: number[] = [];
    let k = 0;
    let misses = 0;
    while (index.length > 3) {
        const n = index.length;
        if (k >= n) {
            k = 0;
        }
        const ia = index[(k + n - 1) % n]!;
        const ib = index[k]!;
        const ic = index[(k + 1) % n]!;
        const a = points[ia]!;
        const b = points[ib]!;
        const c = points[ic]!;
        const turn = turnOf(a, b, c) * way;
        if (Math.abs(turn) <= flat) {
            // Straight on, or straight back: no area to cut, and the outline is the same without it.
            index.splice(k, 1);
            misses = 0;
            continue;
        }
        if (turn > 0 && isEar(points, index, ia, ib, ic, way)) {
            out.push(ia, ib, ic);
            index.splice(k, 1);
            misses = 0;
            continue;
        }
        k++;
        misses++;
        if (misses > n) {
            // Round once with nothing to cut: there is no inside left that an ear can take.
            return null;
        }
    }
    const [ia, ib, ic] = index as [number, number, number];
    if (Math.abs(turnOf(points[ia]!, points[ib]!, points[ic]!)) > flat) {
        out.push(ia, ib, ic);
    }
    return out;
};

/** Whether no other corner left is inside the triangle, or on its sides. */
const isEar = (points: ReadonlyArray<TPoint>, index: readonly number[], ia: number, ib: number, ic: number, way: number): boolean => {
    const a = points[ia]!;
    const b = points[ib]!;
    const c = points[ic]!;
    for (const j of index) {
        if (j === ia || j === ib || j === ic) {
            continue;
        }
        const p = points[j]!;
        if (same(p, a) || same(p, b) || same(p, c)) {
            continue;
        }
        if (turnOf(a, b, p) * way >= 0 && turnOf(b, c, p) * way >= 0 && turnOf(c, a, p) * way >= 0) {
            return false;
        }
    }
    return true;
};

/**
 * What an outline was last cut into, by the list of its corners, and the corners it was cut from.
 */
const kept = new WeakMap<object, { corners: Float64Array; ears: readonly number[] | null }>();

/**
 * `triangulate`, remembered for the list of corners it is handed: a polygon whose corners did not
 * move since the last frame is not cut again, which for a long outline (a chart, a coastline) is most
 * of what it costs. Checking that nothing moved reads each corner once.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const triangulateKept = (points: ReadonlyArray<TPoint>): readonly number[] | null => {
    const last = kept.get(points);
    if (last !== undefined && last.corners.length === points.length * 2) {
        let same = true;
        for (let i = 0; i < points.length; i++) {
            const p = points[i]!;
            if (last.corners[i * 2] !== p.x || last.corners[i * 2 + 1] !== p.y) {
                same = false;
                break;
            }
        }
        if (same) {
            return last.ears;
        }
    }
    // Frozen: it is handed to every caller until the corners move, so none may change it.
    const cut = triangulate(points);
    const ears = cut === null ? null : Object.freeze(cut);
    const corners = new Float64Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
        corners[i * 2] = points[i]!.x;
        corners[i * 2 + 1] = points[i]!.y;
    }
    kept.set(points, { corners, ears });
    return ears;
};
