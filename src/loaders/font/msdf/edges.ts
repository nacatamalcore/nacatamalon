import type { TOutlineSegment } from '../sfnt/t_outline';

/**
 * Which of the three channels an edge counts in, as bits: red 1, green 2, blue 4. An edge in all three
 * is white (7).
 *
 * @internal
 */
export const RED = 1;
/** @internal */
export const GREEN = 2;
/** @internal */
export const BLUE = 4;
/** @internal */
export const YELLOW = RED | GREEN;
/** @internal */
export const MAGENTA = RED | BLUE;
/** @internal */
export const CYAN = GREEN | BLUE;
/** @internal */
export const WHITE = RED | GREEN | BLUE;

/**
 * One edge of a shape with the channels it counts in. A straight edge keeps its control point at its
 * middle, so both kinds have the same fields and the arithmetic below only branches where it must.
 *
 * @internal
 */
export type TEdge = {
    curved: boolean;
    x0: number;
    y0: number;
    cx: number;
    cy: number;
    x1: number;
    y1: number;
    color: number;
    /**
     * Which way it leaves its start and arrives at its end, worked out once: every distance asks.
     */
    sx: number;
    sy: number;
    ex: number;
    ey: number;
    /**
     * The box it fits in, so a point far from it can skip it without measuring.
     */
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

/**
 * The answer to "how far is this point from that edge": the distance with its sign (positive inside),
 * how square-on the nearest point is (0 square, 1 along the edge, used to break ties), and where on
 * the edge it is (0 to 1, past either end when the nearest point is an end).
 *
 * @internal
 */
export type TEdgeDistance = { distance: number; dot: number; t: number };

/**
 * An edge from its points: a curve when `curved`, a straight line otherwise (whose control point is
 * then its middle).
 *
 * @internal
 */
export const makeEdge = (curved: boolean, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, color: number): TEdge => {
    let sx = curved ? cx - x0 : x1 - x0;
    let sy = curved ? cy - y0 : y1 - y0;
    let ex = curved ? x1 - cx : x1 - x0;
    let ey = curved ? y1 - cy : y1 - y0;
    // A curve whose control point sits on one of its ends has no direction there, so the direction
    // from end to end stands in.
    if (sx === 0 && sy === 0) { sx = x1 - x0; sy = y1 - y0; }
    if (ex === 0 && ey === 0) { ex = x1 - x0; ey = y1 - y0; }
    return {
        curved, x0, y0, cx, cy, x1, y1, color, sx, sy, ex, ey,
        // A curve stays inside the triangle of its ends and control point, so these bound it.
        minX: Math.min(x0, cx, x1),
        minY: Math.min(y0, cy, y1),
        maxX: Math.max(x0, cx, x1),
        maxY: Math.max(y0, cy, y1),
    };
};

/**
 * An edge out of a segment of an outline.
 *
 * @internal
 */
export const edgeOf = (segment: TOutlineSegment, color = WHITE): TEdge => (segment.kind === 'line'
    ? makeEdge(false, segment.x0, segment.y0, (segment.x0 + segment.x1) / 2, (segment.y0 + segment.y1) / 2, segment.x1, segment.y1, color)
    : makeEdge(true, segment.x0, segment.y0, segment.cx, segment.cy, segment.x1, segment.y1, color));

/**
 * The point at `t`, 0 the start and 1 the end.
 *
 * @internal
 */
export const pointAt = (edge: TEdge, t: number): [number, number] => {
    if (!edge.curved) {
        return [edge.x0 + (edge.x1 - edge.x0) * t, edge.y0 + (edge.y1 - edge.y0) * t];
    }
    const u = 1 - t;
    return [
        u * u * edge.x0 + 2 * u * t * edge.cx + t * t * edge.x1,
        u * u * edge.y0 + 2 * u * t * edge.cy + t * t * edge.y1,
    ];
};

/**
 * Which way the edge is going at `t`, not normalised. A curve whose control point sits on one of its
 * ends has no direction there, so the direction from end to end stands in.
 *
 * @internal
 */
export const directionAt = (edge: TEdge, t: number): [number, number] => {
    if (!edge.curved) {
        return [edge.sx, edge.sy];
    }
    const x = (1 - t) * (edge.cx - edge.x0) + t * (edge.x1 - edge.cx);
    const y = (1 - t) * (edge.cy - edge.y0) + t * (edge.y1 - edge.cy);
    return x === 0 && y === 0 ? [edge.x1 - edge.x0, edge.y1 - edge.y0] : [x, y];
};

const nonZeroSign = (value: number): number => (value > 0 ? 1 : -1);

const length = (x: number, y: number): number => Math.sqrt(x * x + y * y);

/**
 * `|cos|` of the angle between two directions, which says how square-on a point is to an edge's end.
 */
const alignment = (ax: number, ay: number, bx: number, by: number): number => {
    const la = length(ax, ay);
    const lb = length(bx, by);
    return la === 0 || lb === 0 ? 0 : Math.abs((ax * bx + ay * by) / (la * lb));
};

/**
 * Where the roots of the last equation solved are written, so solving allocates nothing.
 */
const ROOTS = new Float64Array(3);

/**
 * The real roots of `a x² + b x + c` into `ROOTS`; returns how many there are, at most two.
 */
const solveQuadratic = (a: number, b: number, c: number): number => {
    if (Math.abs(a) < 1e-14) {
        if (Math.abs(b) < 1e-14) {
            return 0;
        }
        ROOTS[0] = -c / b;
        return 1;
    }
    const discriminant = b * b - 4 * a * c;
    if (discriminant > 0) {
        const root = Math.sqrt(discriminant);
        ROOTS[0] = (-b + root) / (2 * a);
        ROOTS[1] = (-b - root) / (2 * a);
        return 2;
    }
    if (discriminant === 0) {
        ROOTS[0] = -b / (2 * a);
        return 1;
    }
    return 0;
};

/**
 * The real roots of `x³ + a x² + b x + c` into `ROOTS`; returns how many there are.
 */
const solveCubicNormed = (a: number, b: number, c: number): number => {
    const a2 = a * a;
    let q = (a2 - 3 * b) / 9;
    const r = (a * (2 * a2 - 9 * b) + 27 * c) / 54;
    const r2 = r * r;
    const q3 = q * q * q;
    const third = a / 3;
    if (r2 < q3) {
        const angle = Math.acos(Math.max(-1, Math.min(1, r / Math.sqrt(q3))));
        q = -2 * Math.sqrt(q);
        ROOTS[0] = q * Math.cos(angle / 3) - third;
        ROOTS[1] = q * Math.cos((angle + 2 * Math.PI) / 3) - third;
        ROOTS[2] = q * Math.cos((angle - 2 * Math.PI) / 3) - third;
        return 3;
    }
    const u = (r < 0 ? 1 : -1) * Math.cbrt(Math.abs(r) + Math.sqrt(r2 - q3));
    const v = u === 0 ? 0 : q / u;
    ROOTS[0] = u + v - third;
    if (u === v || Math.abs(u - v) < 1e-12 * Math.abs(u + v)) {
        ROOTS[1] = -0.5 * (u + v) - third;
        return 2;
    }
    return 1;
};

/**
 * The real roots of `a x³ + b x² + c x + d` into `ROOTS`; returns how many there are.
 */
const solveCubic = (a: number, b: number, c: number, d: number): number => {
    if (a !== 0) {
        const bn = b / a;
        // A tiny leading term next to the others is a quadratic in disguise, and dividing by it loses
        // every digit that matters.
        if (Math.abs(bn) < 1e6) {
            return solveCubicNormed(bn, c / a, d / a);
        }
    }
    return solveQuadratic(b, c, d);
};

/**
 * How far a point is from an edge, signed: positive on the right of the edge's direction, which is
 * inside for TrueType's clockwise outer loops (y up). Written into `out` so the millions of calls a
 * font atlas makes allocate nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const edgeDistance = (edge: TEdge, px: number, py: number, out: TEdgeDistance): void => {
    if (!edge.curved) {
        const aqx = px - edge.x0;
        const aqy = py - edge.y0;
        const abx = edge.x1 - edge.x0;
        const aby = edge.y1 - edge.y0;
        const t = (aqx * abx + aqy * aby) / (abx * abx + aby * aby);
        const eqx = (t > 0.5 ? edge.x1 : edge.x0) - px;
        const eqy = (t > 0.5 ? edge.y1 : edge.y0) - py;
        const endDistance = length(eqx, eqy);
        if (t > 0 && t < 1) {
            const ortho = (aqx * aby - aqy * abx) / length(abx, aby);
            if (Math.abs(ortho) < endDistance) {
                out.distance = ortho;
                out.dot = 0;
                out.t = t;
                return;
            }
        }
        out.distance = nonZeroSign(aqx * aby - aqy * abx) * endDistance;
        out.dot = alignment(abx, aby, eqx, eqy);
        out.t = t;
        return;
    }

    // The nearest point of a curve is where the line to it meets the curve square-on, which is a
    // cubic in t. Its ends are checked too, since the nearest point may be one of them.
    const qax = edge.x0 - px;
    const qay = edge.y0 - py;
    const abx = edge.cx - edge.x0;
    const aby = edge.cy - edge.y0;
    const brx = edge.x1 - edge.cx - abx;
    const bry = edge.y1 - edge.cy - aby;
    const a = brx * brx + bry * bry;
    const b = 3 * (abx * brx + aby * bry);
    const c = 2 * (abx * abx + aby * aby) + (qax * brx + qay * bry);
    const d = qax * abx + qay * aby;

    const { sx, sy, ex: edx, ey: edy } = edge;
    let best = nonZeroSign(sx * qay - sy * qax) * length(qax, qay);
    let t = -(qax * sx + qay * sy) / (sx * sx + sy * sy);
    {
        const ex = edge.x1 - px;
        const ey = edge.y1 - py;
        const distance = length(ex, ey);
        if (distance < Math.abs(best)) {
            best = nonZeroSign(edx * ey - edy * ex) * distance;
            t = ((px - edge.cx) * edx + (py - edge.cy) * edy) / (edx * edx + edy * edy);
        }
    }
    const count = solveCubic(a, b, c, d);
    for (let i = 0; i < count; i++) {
        const root = ROOTS[i]!;
        if (root > 0 && root < 1) {
            const ex = qax + 2 * root * abx + root * root * brx;
            const ey = qay + 2 * root * aby + root * root * bry;
            const distance = length(ex, ey);
            if (distance <= Math.abs(best)) {
                const tx = abx + root * brx;
                const ty = aby + root * bry;
                best = nonZeroSign(tx * ey - ty * ex) * distance;
                t = root;
            }
        }
    }

    out.distance = best;
    out.t = t;
    if (t >= 0 && t <= 1) {
        out.dot = 0;
    } else if (t < 0.5) {
        out.dot = alignment(sx, sy, qax, qay);
    } else {
        out.dot = alignment(edx, edy, edge.x1 - px, edge.y1 - py);
    }
};

/**
 * Turns a distance to an edge's end into the distance to the line that carries on from it, when the
 * point is beyond that end and the line is nearer. This is what keeps a corner sharp: past a corner,
 * each channel keeps measuring against its own edge's straight continuation, and where the channels
 * disagree the median draws the corner.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pseudoDistance = (edge: TEdge, px: number, py: number, found: TEdgeDistance): number => {
    if (found.t < 0) {
        const dx = edge.sx;
        const dy = edge.sy;
        const l = length(dx, dy);
        const aqx = px - edge.x0;
        const aqy = py - edge.y0;
        if ((aqx * dx + aqy * dy) / l < 0) {
            const pseudo = (aqx * dy - aqy * dx) / l;
            if (Math.abs(pseudo) <= Math.abs(found.distance)) {
                return pseudo;
            }
        }
    } else if (found.t > 1) {
        const dx = edge.ex;
        const dy = edge.ey;
        const l = length(dx, dy);
        const bqx = px - edge.x1;
        const bqy = py - edge.y1;
        if ((bqx * dx + bqy * dy) / l > 0) {
            const pseudo = (bqx * dy - bqy * dx) / l;
            if (Math.abs(pseudo) <= Math.abs(found.distance)) {
                return pseudo;
            }
        }
    }
    return found.distance;
};

/**
 * Cuts an edge into three, keeping its colour. A loop with a single corner and fewer than three edges
 * needs more edges than it has to be given three colours.
 *
 * @internal
 */
export const splitInThirds = (edge: TEdge): [TEdge, TEdge, TEdge] => {
    const [ax, ay] = pointAt(edge, 1 / 3);
    const [bx, by] = pointAt(edge, 2 / 3);
    if (!edge.curved) {
        const line = (x0: number, y0: number, x1: number, y1: number): TEdge =>
            makeEdge(false, x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1, edge.color);
        return [line(edge.x0, edge.y0, ax, ay), line(ax, ay, bx, by), line(bx, by, edge.x1, edge.y1)];
    }
    // The control point of each third, from the curve's own control point by de Casteljau.
    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
    const curve = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): TEdge =>
        makeEdge(true, x0, y0, cx, cy, x1, y1, edge.color);
    return [
        curve(edge.x0, edge.y0, lerp(edge.x0, edge.cx, 1 / 3), lerp(edge.y0, edge.cy, 1 / 3), ax, ay),
        curve(ax, ay,
            lerp(lerp(edge.x0, edge.cx, 5 / 9), lerp(edge.cx, edge.x1, 4 / 9), 0.5),
            lerp(lerp(edge.y0, edge.cy, 5 / 9), lerp(edge.cy, edge.y1, 4 / 9), 0.5),
            bx, by),
        curve(bx, by, lerp(edge.cx, edge.x1, 2 / 3), lerp(edge.cy, edge.y1, 2 / 3), edge.x1, edge.y1),
    ];
};
