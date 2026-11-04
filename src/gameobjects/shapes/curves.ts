type TPoint = { x: number; y: number };

const TURN = Math.PI * 2;

/**
 * How many game pixels of curve one straight side stands for: small enough that a circle reads as
 * round at its size, and no more sides than that.
 */
const PIXELS_PER_SIDE = 2;

const FEWEST = 8;
const MOST = 256;

/**
 * How many straight sides a curve of this radius, on screen, takes to go through `sweep` radians:
 * one every couple of pixels, at least eight for a whole turn and never more than 256. `asked`, a
 * shape's own `segments`, wins when it is a number.
 *
 * @internal
 */
export const sidesFor = (radius: number, sweep: number, asked?: number): number => {
    const share = Math.min(1, Math.abs(sweep) / TURN);
    if (asked !== undefined && Number.isFinite(asked) && asked >= 1) {
        return Math.max(1, Math.round(Math.min(asked, MOST) * share)) || 1;
    }
    const whole = Math.min(MOST, Math.max(FEWEST, Math.ceil((TURN * Math.max(0, radius)) / PIXELS_PER_SIDE)));
    return Math.max(1, Math.ceil(whole * share));
};

/**
 * How far a slice goes, from `start` to `end`: both left out (or a whole turn or more apart) is the
 * whole curve, `null`.
 *
 * @internal
 */
export const sweepOf = (start: number | undefined, end: number | undefined): { from: number; sweep: number } | null => {
    if (start === undefined && end === undefined) {
        return null;
    }
    const from = Number.isFinite(start) ? start! : 0;
    const to = Number.isFinite(end) ? end! : from + TURN;
    const sweep = to - from;
    return Math.abs(sweep) >= TURN ? null : { from, sweep };
};

/**
 * The points along an ellipse turned by `rotation`, from `from` through `sweep` radians in `sides`
 * straight sides: `sides + 1` points for a slice, `sides` for a whole turn (the last would be the
 * first again).
 *
 * @internal
 */
export const ellipsePoints = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rotation: number,
    from: number,
    sweep: number,
    sides: number,
    whole: boolean,
    into: TPoint[] = [],
): TPoint[] => {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const count = whole ? sides : sides + 1;
    for (let i = 0; i < count; i++) {
        const angle = from + (sweep * i) / sides;
        const x = Math.cos(angle) * rx;
        const y = Math.sin(angle) * ry;
        into.push({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos });
    }
    return into;
};

/**
 * The outline of a rectangle by its top-left corner, its corners rounded by `radius` (one, or
 * top-left, top-right, bottom-right, bottom-left), each no more than half its shorter side, turned
 * about its middle by `rotation`. Clockwise on the screen, from its top-left.
 *
 * @internal
 */
export const rectPoints = (
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number | readonly number[] | undefined,
    rotation: number,
    scale: number,
): TPoint[] => {
    // A negative size is the same rectangle measured from its other side.
    const left = Math.min(x, x + width);
    const top = Math.min(y, y + height);
    const w = Math.abs(width);
    const h = Math.abs(height);
    const most = Math.min(w, h) / 2;
    const radii = (typeof radius === 'number' ? [radius, radius, radius, radius] : radius ?? [0, 0, 0, 0])
        .slice(0, 4)
        .map((r) => (Number.isFinite(r) ? Math.min(Math.max(r, 0), most) : 0));
    while (radii.length < 4) {
        radii.push(0);
    }
    const points: TPoint[] = [];
    // Each corner's middle, and where its quarter turn starts: top-left from the left, round clockwise.
    const corners: Array<[number, number, number]> = [
        [left + radii[0]!, top + radii[0]!, Math.PI],
        [left + w - radii[1]!, top + radii[1]!, -Math.PI / 2],
        [left + w - radii[2]!, top + h - radii[2]!, 0],
        [left + radii[3]!, top + h - radii[3]!, Math.PI / 2],
    ];
    corners.forEach(([cx, cy, from], i) => {
        const r = radii[i]!;
        if (r <= 0) {
            points.push({ x: cx, y: cy });
            return;
        }
        ellipsePoints(cx, cy, r, r, 0, from, Math.PI / 2, sidesFor(r * scale, Math.PI / 2), false, points);
    });
    if (rotation !== 0 && Number.isFinite(rotation)) {
        const mx = left + w / 2;
        const my = top + h / 2;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        for (const p of points) {
            const dx = p.x - mx;
            const dy = p.y - my;
            p.x = mx + dx * cos - dy * sin;
            p.y = my + dx * sin + dy * cos;
        }
    }
    return points;
};
