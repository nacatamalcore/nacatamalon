import { sidesFor } from './curves';

type TPoint = { x: number; y: number };

/**
 * Where a triangle goes: its three corners, one after another.
 *
 * @internal
 */
export type TEmitTriangle = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => void;

/**
 * How a line is drawn, already read: how far each of its sides reaches from the line (`left` on
 * the side its turn to the left would go), and how its corners and ends are made.
 *
 * @internal
 */
export type TStrokeLook = {
    left: number;
    right: number;
    join: 'miter' | 'round' | 'bevel';
    cap: 'butt' | 'round' | 'square';
    /** The object's scale, for how many sides a round corner takes on the screen. */
    scale: number;
};

/**
 * How far past its corner a sharp corner's point may reach, in widths of its side: past it, the
 * corner is cut flat. Four is a corner of about 29 degrees.
 */
const MITER_LIMIT = 4;

/**
 * Whether two points are the same as far as a line through them can tell: equal, or apart by less
 * than what rounding leaves where a curve meets a straight side.
 */
const near = (a: TPoint, b: TPoint): boolean => {
    const tolerance = 1e-9 * (1 + Math.max(Math.abs(a.x), Math.abs(a.y)));
    return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
};

/** The points with each one repeated straight after itself left out, and, closed, the last if it is the first. */
const cleaned = (points: ReadonlyArray<TPoint>, closed: boolean): TPoint[] => {
    const out: TPoint[] = [];
    for (const p of points) {
        if (p === null || typeof p !== 'object' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            continue;
        }
        const last = out[out.length - 1];
        if (last === undefined || !near(last, p)) {
            out.push(p);
        }
    }
    if (closed) {
        while (out.length > 1 && near(out[0]!, out[out.length - 1]!)) {
            out.pop();
        }
    }
    return out;
};

/** A fan of triangles from `(cx, cy)`, round from angle `from` through `sweep`, `radius` out. */
const fan = (emit: TEmitTriangle, cx: number, cy: number, radius: number, from: number, sweep: number, scale: number): void => {
    const sides = sidesFor(radius * scale, sweep);
    let px = cx + Math.cos(from) * radius;
    let py = cy + Math.sin(from) * radius;
    for (let i = 1; i <= sides; i++) {
        const angle = from + (sweep * i) / sides;
        const nx = cx + Math.cos(angle) * radius;
        const ny = cy + Math.sin(angle) * radius;
        emit(cx, cy, px, py, nx, ny);
        px = nx;
        py = ny;
    }
};

/**
 * The triangles of a line through `points` as wide as `look` says, `closed` joining the last point to
 * the first.
 *
 * Each side is a band; where two meet, the inside corner is where their inner edges cross (when the
 * sides are long enough to reach it), so a see-through line is not drawn twice there, and the outside
 * is filled as `join` says. An open line ends as `cap` says; one of a single point is a dot when its
 * ends are round or square.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const strokePath = (points: ReadonlyArray<TPoint>, closed: boolean, look: TStrokeLook, emit: TEmitTriangle): void => {
    const path = cleaned(points, closed);
    const { left, right } = look;
    if (!(left + right > 0)) {
        return;
    }
    const count = path.length;
    if (count === 1) {
        // A dot: what a line with no length shows when its ends stick out. Closed, it has none.
        if (closed) {
            return;
        }
        const p = path[0]!;
        const h = (left + right) / 2;
        if (look.cap === 'round') {
            fan(emit, p.x, p.y, h, 0, Math.PI * 2, look.scale);
        } else if (look.cap === 'square') {
            emit(p.x - h, p.y - h, p.x + h, p.y - h, p.x + h, p.y + h);
            emit(p.x - h, p.y - h, p.x + h, p.y + h, p.x - h, p.y + h);
        }
        return;
    }
    if (count < 2) {
        return;
    }
    // Two points closed are one side there and back: drawn as the side, and, being closed, with no
    // ends sticking out of it.
    const isClosed = closed && count > 2;
    const sides = isClosed ? count : count - 1;
    const cap = closed ? 'butt' : look.cap;

    // Each side's direction, normal (its left) and length.
    const dx: number[] = [];
    const dy: number[] = [];
    const nx: number[] = [];
    const ny: number[] = [];
    const length: number[] = [];
    for (let i = 0; i < sides; i++) {
        const a = path[i]!;
        const b = path[(i + 1) % count]!;
        const lx = b.x - a.x;
        const ly = b.y - a.y;
        const l = Math.hypot(lx, ly);
        dx.push(lx / l);
        dy.push(ly / l);
        nx.push(-ly / l);
        ny.push(lx / l);
        length.push(l);
    }

    // The corners each side's band ends at: [left, right] at its start and at its end, by default
    // straight out from its points, moved to where the inner edges cross at a join.
    const startLx: number[] = [];
    const startLy: number[] = [];
    const startRx: number[] = [];
    const startRy: number[] = [];
    const endLx: number[] = [];
    const endLy: number[] = [];
    const endRx: number[] = [];
    const endRy: number[] = [];
    for (let i = 0; i < sides; i++) {
        const a = path[i]!;
        const b = path[(i + 1) % count]!;
        startLx.push(a.x + nx[i]! * left);
        startLy.push(a.y + ny[i]! * left);
        startRx.push(a.x - nx[i]! * right);
        startRy.push(a.y - ny[i]! * right);
        endLx.push(b.x + nx[i]! * left);
        endLy.push(b.y + ny[i]! * left);
        endRx.push(b.x - nx[i]! * right);
        endRy.push(b.y - ny[i]! * right);
    }

    // The outside of each join, drawn once the bands are known.
    const joins: Array<() => void> = [];
    const first = isClosed ? 0 : 1;
    for (let v = first; v < count; v++) {
        if (!isClosed && v === count - 1) {
            break;
        }
        const into = (v + sides - 1) % sides;
        const out = v % sides;
        const p = path[v]!;
        const turn = dx[into]! * dy[out]! - dy[into]! * dx[out]!;
        const dot = dx[into]! * dx[out]! + dy[into]! * dy[out]!;
        if (Math.abs(turn) < 1e-9) {
            if (dot > 0) {
                continue;
            }
            // Straight back: nothing between the bands to fill but a round end, if round.
            if (look.join === 'round') {
                const h = (left + right) / 2;
                // From its left round the front, to its right.
                const angle = Math.atan2(ny[into]!, nx[into]!);
                joins.push(() => fan(emit, p.x, p.y, h, angle, -Math.PI, look.scale));
            }
            continue;
        }
        // The inside of the turn is on the left when it turns left.
        const innerLeft = turn > 0;
        const inner = innerLeft ? left : right;
        const outer = innerLeft ? right : left;
        const inSign = innerLeft ? 1 : -1;
        const outSign = -inSign;
        let bx = nx[into]! + nx[out]!;
        let by = ny[into]! + ny[out]!;
        const bl = Math.hypot(bx, by);
        bx /= bl;
        by /= bl;
        // The cosine of half the turn, from the bisector and either normal.
        const cosHalf = bx * nx[into]! + by * ny[into]!;
        const tanHalf = Math.sqrt(Math.max(0, 1 - cosHalf * cosHalf)) / cosHalf;

        // Where the inner edges cross, if both sides are long enough for it.
        let ix = p.x;
        let iy = p.y;
        let merged = false;
        if (inner === 0) {
            merged = true;
        } else if (inner * tanHalf <= Math.min(length[into]!, length[out]!) / 2) {
            ix = p.x + bx * inSign * (inner / cosHalf);
            iy = p.y + by * inSign * (inner / cosHalf);
            merged = true;
        }
        if (merged) {
            if (innerLeft) {
                endLx[into] = ix;
                endLy[into] = iy;
                startLx[out] = ix;
                startLy[out] = iy;
            } else {
                endRx[into] = ix;
                endRy[into] = iy;
                startRx[out] = ix;
                startRy[out] = iy;
            }
        }
        if (outer === 0 && inner === 0) {
            continue;
        }
        const ax = p.x + nx[into]! * outSign * outer;
        const ay = p.y + ny[into]! * outSign * outer;
        const cx = p.x + nx[out]! * outSign * outer;
        const cy = p.y + ny[out]! * outSign * outer;
        joins.push(() => {
            if (merged && outer > 0 && (ix !== p.x || iy !== p.y)) {
                // What lies between the two bands' cut ends and the point itself. With nothing on the
                // outside (a line all inside its outline) the bands already meet there.
                emit(ix, iy, ax, ay, p.x, p.y);
                emit(ix, iy, p.x, p.y, cx, cy);
            }
            if (outer === 0) {
                return;
            }
            if (look.join === 'round') {
                const from = Math.atan2(ay - p.y, ax - p.x);
                const to = Math.atan2(cy - p.y, cx - p.x);
                let sweep = to - from;
                if (sweep > Math.PI) {
                    sweep -= Math.PI * 2;
                } else if (sweep < -Math.PI) {
                    sweep += Math.PI * 2;
                }
                fan(emit, p.x, p.y, outer, from, sweep, look.scale);
                return;
            }
            const reach = outer / cosHalf;
            if (look.join === 'miter' && reach <= outer * MITER_LIMIT) {
                const tx = p.x + bx * outSign * reach;
                const ty = p.y + by * outSign * reach;
                emit(p.x, p.y, ax, ay, tx, ty);
                emit(p.x, p.y, tx, ty, cx, cy);
                return;
            }
            emit(p.x, p.y, ax, ay, cx, cy);
        });
    }

    // An open line's ends.
    if (!isClosed) {
        const last = sides - 1;
        if (cap === 'square') {
            const h = (left + right) / 2;
            startLx[0] = startLx[0]! - dx[0]! * h;
            startLy[0] = startLy[0]! - dy[0]! * h;
            startRx[0] = startRx[0]! - dx[0]! * h;
            startRy[0] = startRy[0]! - dy[0]! * h;
            endLx[last] = endLx[last]! + dx[last]! * h;
            endLy[last] = endLy[last]! + dy[last]! * h;
            endRx[last] = endRx[last]! + dx[last]! * h;
            endRy[last] = endRy[last]! + dy[last]! * h;
        } else if (cap === 'round') {
            const h = (left + right) / 2;
            const a = path[0]!;
            const b = path[count - 1]!;
            const startAngle = Math.atan2(ny[0]!, nx[0]!);
            const endAngle = Math.atan2(-ny[last]!, -nx[last]!);
            joins.push(() => fan(emit, a.x, a.y, h, startAngle, Math.PI, look.scale));
            joins.push(() => fan(emit, b.x, b.y, h, endAngle, Math.PI, look.scale));
        }
    }

    for (let i = 0; i < sides; i++) {
        emit(startLx[i]!, startLy[i]!, endLx[i]!, endLy[i]!, endRx[i]!, endRy[i]!);
        emit(startLx[i]!, startLy[i]!, endRx[i]!, endRy[i]!, startRx[i]!, startRy[i]!);
    }
    for (const join of joins) {
        join();
    }
};
