/**
 * Outlines in the plane, with holes: checked, turned the way round a solid wants them, and cut into
 * triangles. What an extruded shape's two faces are made from.
 */

type TPoint = { readonly x: number; readonly y: number };

/**
 * How much `b` turns left going from `a` to `c`: twice the area of the three, signed. Three on one
 * line written in decimals (`0.1` is not quite a tenth) come out a hair off it either way, and a
 * hair the wrong way picks a wrong triangle; so a turn that small beside the lengths it is made of
 * is no turn.
 */
const turnOf = (a: TPoint, b: TPoint, c: TPoint): number => {
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const turn = ux * vy - uy * vx;
    return Math.abs(turn) <= (Math.abs(ux) + Math.abs(uy)) * (Math.abs(vx) + Math.abs(vy)) * 1e-12 ? 0 : turn;
};

const same = (a: TPoint, b: TPoint): boolean => a.x === b.x && a.y === b.y;

/**
 * The area an outline closes, signed: above 0 when it goes round to the left (counter-clockwise,
 * `y` up), below when to the right.
 *
 * @internal
 */
export const areaOf = (ring: ReadonlyArray<TPoint>): number => {
    // Measured from its first point rather than from the origin, so a small shape far from it is
    // not lost in the size of the numbers that say where it is.
    const o = ring[0];
    if (o === undefined) {
        return 0;
    }
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        sum += (a.x - o.x) * (b.y - o.y) - (b.x - o.x) * (a.y - o.y);
    }
    return sum / 2;
};

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
 * Whether an outline crosses or touches itself: two sides that are not neighbours meeting, or two
 * that are folding back over each other.
 *
 * @internal
 */
export const crossesItself = (ring: ReadonlyArray<TPoint>): boolean => {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const c = ring[(i + 2) % n]!;
        // Back along the side it came by.
        if (turnOf(a, b, c) === 0 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) {
            return true;
        }
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) {
                continue;
            }
            if (touch(a, b, ring[j]!, ring[(j + 1) % n]!)) {
                return true;
            }
        }
    }
    return false;
};

/**
 * Whether any side of one outline meets any side of the other.
 *
 * @internal
 */
export const ringsTouch = (one: ReadonlyArray<TPoint>, other: ReadonlyArray<TPoint>): boolean => {
    for (let i = 0; i < one.length; i++) {
        for (let j = 0; j < other.length; j++) {
            if (touch(one[i]!, one[(i + 1) % one.length]!, other[j]!, other[(j + 1) % other.length]!)) {
                return true;
            }
        }
    }
    return false;
};

/**
 * Whether `p` is inside the outline: for a point on none of its sides, which is the only kind asked
 * about once no sides meet.
 *
 * @internal
 */
export const insideRing = (p: TPoint, ring: ReadonlyArray<TPoint>): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!;
        const b = ring[j]!;
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
};

/** Whether every point is on one line, which closes nothing however it is gone round. */
const onOneLine = (ring: ReadonlyArray<TPoint>): boolean => ring.every((p) => turnOf(ring[0]!, ring[1]!, p) === 0);

/**
 * An outline as given, with a point repeated straight after itself, or the first again at the end,
 * passed over. `null` when a point is not two numbers.
 *
 * @internal
 */
export const cleanRing = (points: ReadonlyArray<TPoint>): TPoint[] | null => {
    const out: TPoint[] = [];
    for (const point of points) {
        if (point === null || typeof point !== 'object' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            return null;
        }
        if (out.length === 0 || !same(out[out.length - 1]!, point)) {
            out.push({ x: point.x, y: point.y });
        }
    }
    while (out.length > 1 && same(out[0]!, out[out.length - 1]!)) {
        out.pop();
    }
    return out;
};

const insideTriangle = (a: TPoint, b: TPoint, c: TPoint, p: TPoint): boolean => {
    const d1 = turnOf(a, b, p);
    const d2 = turnOf(b, c, p);
    const d3 = turnOf(c, a, p);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

/** Whether `p` is inside the triangle, not on its sides. */
const insideOnly = (a: TPoint, b: TPoint, c: TPoint, p: TPoint): boolean => {
    const d1 = turnOf(a, b, p);
    const d2 = turnOf(b, c, p);
    const d3 = turnOf(c, a, p);
    return (d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0);
};

/**
 * Whether, from the corner `at` (coming from `prev`, going on to `next`, the solid on the left), the
 * way towards `toward` goes into the solid.
 */
const opensToward = (prev: TPoint, at: TPoint, next: TPoint, toward: TPoint): boolean =>
    turnOf(prev, at, next) >= 0
        ? turnOf(prev, at, toward) > 0 && turnOf(at, next, toward) > 0
        : turnOf(prev, at, toward) > 0 || turnOf(at, next, toward) > 0;

/**
 * Where along `ring` a hole whose rightmost corner is `m` is joined to it: the place of a corner
 * seen from `m` with nothing in the way, found by looking right from `m` to the nearest side, then
 * to whichever corner of what lies between is closest in angle to that look.
 */
const bridgeTo = (points: ReadonlyArray<TPoint>, ring: readonly number[], m: TPoint): number => {
    const n = ring.length;
    let nearest = Infinity;
    let side = -1;
    const rightEnd = (i: number): number => Math.max(points[ring[i]!]!.x, points[ring[(i + 1) % n]!]!.x);
    for (let i = 0; i < n; i++) {
        const a = points[ring[i]!]!;
        const b = points[ring[(i + 1) % n]!]!;
        if (a.y === b.y) {
            if (a.y === m.y && Math.max(a.x, b.x) >= m.x) {
                const x = Math.max(m.x, Math.min(a.x, b.x));
                if (x < nearest) {
                    nearest = x;
                    side = i;
                }
            }
            continue;
        }
        if (Math.min(a.y, b.y) <= m.y && m.y <= Math.max(a.y, b.y)) {
            // A side ending level with `m` is met at its end exactly: worked out, it can come a hair
            // short of it and win over the side that is really nearer.
            const x = m.y === a.y ? a.x : m.y === b.y ? b.x : a.x + ((m.y - a.y) * (b.x - a.x)) / (b.y - a.y);
            // Two sides met at the same place meet at a corner they share, or one of them ends
            // there: the one whose right end is nearer, so the corner picked is not one beyond.
            const tie = x === nearest && side !== -1 && Math.max(a.x, b.x) < rightEnd(side);
            if (x >= m.x && (x < nearest || tie)) {
                nearest = x;
                side = i;
            }
        }
    }
    if (side === -1) {
        throw new Error('[NacatamalOn] outline: a hole found no side to its right to be joined to.');
    }
    const hit = { x: nearest, y: m.y };
    const a = points[ring[side]!]!;
    const b = points[ring[(side + 1) % n]!]!;
    let target: TPoint;
    if (same(hit, a)) {
        target = a;
    } else if (same(hit, b)) {
        target = b;
    } else {
        target = b.x > a.x ? b : a;
        // A corner inside the triangle between `m`, where the look hit and the corner picked would
        // stand in the way of the join: then the one of those closest in angle to the look.
        let bestAngle = Infinity;
        let bestDistance = Infinity;
        const picked = target;
        for (let i = 0; i < n; i++) {
            const v = points[ring[i]!]!;
            if (same(v, picked) || v.x < m.x || !insideTriangle(m, hit, picked, v)) {
                continue;
            }
            const angle = Math.atan2(Math.abs(v.y - m.y), v.x - m.x);
            const distance = Math.hypot(v.x - m.x, v.y - m.y);
            if (angle < bestAngle || (angle === bestAngle && distance < bestDistance)) {
                bestAngle = angle;
                bestDistance = distance;
                target = v;
            }
        }
    }
    // A corner already joined to a hole is in the ring twice: the one whose opening faces `m`.
    let first = -1;
    for (let i = 0; i < n; i++) {
        if (!same(points[ring[i]!]!, target)) {
            continue;
        }
        if (first === -1) {
            first = i;
        }
        if (opensToward(points[ring[(i - 1 + n) % n]!]!, target, points[ring[(i + 1) % n]!]!, m)) {
            return i;
        }
    }
    return first;
};

/**
 * Cuts a ring of places in `points`, the solid on its left, into triangles, each the corner cut off
 * where two sides meet with nothing else inside them (an ear), one at a time until three are left.
 * A corner of the ring may stand where another does: the two ends of a join to a hole.
 */
const clipEars = (points: ReadonlyArray<TPoint>, ring: readonly number[]): number[] => {
    const n = ring.length;
    const prev = ring.map((_, i) => (i - 1 + n) % n);
    const next = ring.map((_, i) => (i + 1) % n);
    const out: number[] = [];
    const at = (i: number): TPoint => points[ring[i]!]!;
    const remove = (i: number): void => {
        next[prev[i]!] = next[i]!;
        prev[next[i]!] = prev[i]!;
    };

    // Only a corner that turns the other way can stand inside an ear and spoil it: one that turns
    // the same way and touches its side is the ring going on past it. `strict`, only one inside
    // it and not on its sides, for the last resort.
    const isEar = (i: number, strict = false): boolean => {
        const a = at(prev[i]!);
        const b = at(i);
        const c = at(next[i]!);
        for (let j = next[next[i]!]!; j !== prev[i]; j = next[j]!) {
            const p = at(j);
            if (same(p, a) || same(p, b) || same(p, c) || turnOf(at(prev[j]!), p, at(next[j]!)) > 0) {
                continue;
            }
            if (strict ? insideOnly(a, b, c, p) : insideTriangle(a, b, c, p)) {
                return false;
            }
        }
        return true;
    };

    let left = n;
    let i = 0;
    let stalled = 0;
    while (left > 3) {
        const turn = turnOf(at(prev[i]!), at(i), at(next[i]!));
        if (turn === 0) {
            // On a straight line between its neighbours, or a spike back along it: nothing to cut,
            // but a triangle with no inside all the same, so every side of the solid that meets the
            // face there is met by one of the face's: closed, for anything that walks its edges (a
            // collider, a tool). Drawn, it covers nothing, and the face meets the side along the
            // whole line, as a corner on a straight side always does.
            out.push(ring[prev[i]!]!, ring[i]!, ring[next[i]!]!);
            const before = prev[i]!;
            remove(i);
            left--;
            i = before;
            stalled = 0;
            continue;
        }
        if (turn > 0 && isEar(i)) {
            out.push(ring[prev[i]!]!, ring[i]!, ring[next[i]!]!);
            const after = next[i]!;
            remove(i);
            left--;
            i = after;
            stalled = 0;
            continue;
        }
        i = next[i]!;
        stalled++;
        if (stalled > left) {
            // Round once with no ear, which only rounding can do to an outline that has one: a corner
            // with nothing strictly inside it is cut, or failing that the first that turns the right
            // way, so the shape still closes.
            let found = -1;
            for (const strict of [true, false]) {
                let j = i;
                for (let k = 0; k < left && found === -1; k++, j = next[j]!) {
                    if (turnOf(at(prev[j]!), at(j), at(next[j]!)) > 0 && (!strict || isEar(j, true))) {
                        found = j;
                    }
                }
                if (found !== -1) {
                    break;
                }
            }
            if (found === -1) {
                return out;
            }
            out.push(ring[prev[found]!]!, ring[found]!, ring[next[found]!]!);
            i = next[found]!;
            remove(found);
            left--;
            stalled = 0;
        }
    }
    if (turnOf(at(prev[i]!), at(i), at(next[i]!)) >= 0) {
        out.push(ring[prev[i]!]!, ring[i]!, ring[next[i]!]!);
    }
    return out;
};

/**
 * Cuts an outline with holes into triangles, counter-clockwise, as places in the outline's points
 * followed by each hole's in turn. Every point is in one at least: one on a straight line between
 * its neighbours is in a triangle with no inside, so what meets the face there meets it whole. The outline goes counter-clockwise and each hole clockwise, and
 * none crosses itself or another: what `checkOutline` hands back.
 *
 * Each hole is joined to what is right of it by a seam there and back, from its rightmost corner,
 * the rightmost hole first, so the whole is one ring that goes round every hole; then that ring is
 * cut ear by ear.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const triangulateWithHoles = (outline: ReadonlyArray<TPoint>, holes: ReadonlyArray<ReadonlyArray<TPoint>>): number[] => {
    const points: TPoint[] = [...outline, ...holes.flat()];
    let ring = outline.map((_, i) => i);
    const holeRings: number[][] = [];
    let start = outline.length;
    for (const hole of holes) {
        holeRings.push(hole.map((_, k) => start + k));
        start += hole.length;
    }
    const rightmost = (hole: readonly number[]): number => {
        let best = 0;
        for (let k = 1; k < hole.length; k++) {
            const p = points[hole[k]!]!;
            const q = points[hole[best]!]!;
            if (p.x > q.x || (p.x === q.x && p.y < q.y)) {
                best = k;
            }
        }
        return best;
    };
    holeRings.sort((one, other) => points[other[rightmost(other)]!]!.x - points[one[rightmost(one)]!]!.x);
    for (const hole of holeRings) {
        const m = rightmost(hole);
        const join = bridgeTo(points, ring, points[hole[m]!]!);
        ring = [...ring.slice(0, join + 1), ...hole.slice(m), ...hole.slice(0, m), hole[m]!, ring[join]!, ...ring.slice(join + 1)];
    }
    return clipEars(points, ring);
};

/**
 * An outline and its holes checked and turned the way round a solid wants them: the outline
 * counter-clockwise and each hole clockwise, so the solid is on the left of every side. Says what is
 * wrong in the shape's own terms.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const checkOutline = (
    hook: string,
    outline: ReadonlyArray<TPoint>,
    holes: ReadonlyArray<ReadonlyArray<TPoint>>,
): { outline: TPoint[]; holes: TPoint[][] } => {
    const outer = Array.isArray(outline) ? cleanRing(outline) : null;
    if (outer === null) {
        throw new Error(`[NacatamalOn] ${hook}: the outline takes a list of points, { x, y } each, with numbers.`);
    }
    // Crossing first: a bow tie closes nothing too, its two halves adding up to none, and what is
    // wrong with it is the crossing.
    if (outer.length >= 3 && !onOneLine(outer) && crossesItself(outer)) {
        throw new Error(`[NacatamalOn] ${hook}: the outline crosses or touches itself, so it has no one inside. Give its points in order round it.`);
    }
    // On one line as near as a turn can tell, which may still close a hair of area going there and
    // back across itself: nothing to push out either way.
    if (outer.length < 3 || onOneLine(outer) || areaOf(outer) === 0) {
        throw new Error(`[NacatamalOn] ${hook}: the outline has no inside: it needs three points at least, not all on one line.`);
    }
    if (!Array.isArray(holes)) {
        throw new Error(`[NacatamalOn] ${hook}: holes takes a list of outlines, each a list of { x, y } points.`);
    }
    const inner: TPoint[][] = [];
    for (const [i, given] of holes.entries()) {
        const hole = Array.isArray(given) ? cleanRing(given) : null;
        if (hole === null) {
            throw new Error(`[NacatamalOn] ${hook}: hole ${i} takes a list of points, { x, y } each, with numbers.`);
        }
        if (hole.length >= 3 && !onOneLine(hole) && crossesItself(hole)) {
            throw new Error(`[NacatamalOn] ${hook}: hole ${i} crosses or touches itself. Give its points in order round it.`);
        }
        if (hole.length < 3 || onOneLine(hole) || areaOf(hole) === 0) {
            throw new Error(`[NacatamalOn] ${hook}: hole ${i} has no inside: it needs three points at least, not all on one line.`);
        }
        if (ringsTouch(hole, outer) || !insideRing(hole[0]!, outer)) {
            throw new Error(`[NacatamalOn] ${hook}: hole ${i} is not inside the outline, with some of the solid all round it. A hole that reaches the edge is a notch: draw it in the outline.`);
        }
        for (const [j, other] of inner.entries()) {
            if (ringsTouch(hole, other) || insideRing(hole[0]!, other) || insideRing(other[0]!, hole)) {
                throw new Error(`[NacatamalOn] ${hook}: holes ${j} and ${i} meet or one is inside the other. Make them one hole, or a piece of their own.`);
            }
        }
        inner.push(hole);
    }
    return {
        outline: areaOf(outer) > 0 ? outer : outer.reverse(),
        holes: inner.map((hole) => (areaOf(hole) < 0 ? hole : hole.reverse())),
    };
};
