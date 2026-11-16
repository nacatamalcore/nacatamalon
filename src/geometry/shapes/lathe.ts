import { addRing, addRingQuads, createGeometryBuilder } from '../build/geometry_builder';

/**
 * A point of a profile: how far from the axis, and how high.
 *
 * @internal
 */
export type TLathePoint = { x: number; y: number };

/**
 * How a lathe is turned: from what angle and how far round, and how sharply its profile has to
 * turn at a point for the surface to meet there in a hard edge.
 *
 * @internal
 */
export type TLatheTurn = { startAngle: number; arc: number; creaseAngle: number | null };

const same = (a: TLathePoint, c: TLathePoint): boolean => a.x === c.x && a.y === c.y;

/**
 * The profile with every point where it turns more than `creaseAngle` given twice, which is what
 * makes a hard edge there. A point already given twice is left as it is.
 */
const creased = (profile: readonly TLathePoint[], creaseAngle: number): TLathePoint[] => {
    const out: TLathePoint[] = [];
    for (let j = 0; j < profile.length; j++) {
        const point = profile[j]!;
        out.push(point);
        const before = profile[j - 1];
        const after = profile[j + 1];
        if (before === undefined || after === undefined || same(before, point) || same(after, point)) {
            continue;
        }
        const ax = point.x - before.x;
        const ay = point.y - before.y;
        const bx = after.x - point.x;
        const by = after.y - point.y;
        // By the angle itself, never more than half a turn, so a `creaseAngle` of half a turn or
        // more creases nothing, and a right angle is not more than a right angle.
        if (Math.atan2(Math.abs(ax * by - ay * bx), ax * bx + ay * by) > creaseAngle) {
            out.push(point);
        }
    }
    return out;
};

/**
 * A profile turned about the Y axis: every point becomes a ring of corners, and each two rings in a
 * row a band of the surface between them.
 *
 * The profile goes from the bottom up, so the way it faces is outwards: crossed with the way up the
 * profile, the facing points away from the axis. Each point faces between the two pieces of the
 * profile beside it, which rounds the surface across, except where the profile turns more than
 * `creaseAngle`, when there is one, or a point is given twice in a row: there each copy faces along
 * its own piece, and the edge comes out hard, as the rim of a base does. Round the axis it is always
 * smooth.
 *
 * It is turned `arc` round from `startAngle`, the way `rotationY` turns (from `+x` towards `-z`);
 * part of the way round, its ends are left open.
 *
 * The picture runs once across the turn (`u`) and once up the profile by its length (`v`, down from
 * the top), so a label wrapped round a bottle is not stretched where the profile is steep.
 *
 * @internal
 */
export const buildLathe = (given: readonly TLathePoint[], segments: number, turn: TLatheTurn = { startAngle: 0, arc: Math.PI * 2, creaseAngle: null }) => {
    const b = createGeometryBuilder();
    const profile = turn.creaseAngle === null ? given : creased(given, turn.creaseAngle);
    const count = profile.length;

    // How far up the profile each point is, for the picture.
    const along = [0];
    for (let j = 1; j < count; j++) {
        along.push(along[j - 1] + Math.hypot(profile[j].x - profile[j - 1].x, profile[j].y - profile[j - 1].y));
    }
    const length = along[count - 1] || 1;

    const rings = profile.map((point, j) => {
        // The pieces of the profile on either side, the one that is only this point skipped: a
        // point given twice is a hard edge, and each copy faces along its own piece alone.
        const before = j > 0 && !same(profile[j - 1], point) ? profile[j - 1] : point;
        const after = j < count - 1 && !same(profile[j + 1], point) ? profile[j + 1] : point;
        let dx = after.x - before.x;
        let dy = after.y - before.y;
        if (dx === 0 && dy === 0) {
            dy = 1;
        }
        const span = Math.hypot(dx, dy);
        dx /= span;
        dy /= span;
        // Outwards: the way up the profile turned a quarter, away from the axis.
        const out = dy;
        const up = -dx;
        return addRing(
            b, segments,
            (phi) => [Math.cos(phi) * point.x, point.y, -Math.sin(phi) * point.x],
            (phi) => [Math.cos(phi) * out, up, -Math.sin(phi) * out],
            1 - along[j] / length,
            turn.startAngle,
            turn.arc,
        );
    });

    for (let j = 0; j < count - 1; j++) {
        // Two copies of one point are one edge, not a band.
        if (same(profile[j], profile[j + 1])) {
            continue;
        }
        addRingQuads(b, rings[j + 1], rings[j]);
    }

    return b.build();
};
