import { addRing, addRingQuads, createGeometryBuilder } from '../build/geometry_builder';

/**
 * A point of a profile: how far from the axis, and how high.
 *
 * @internal
 */
export type TLathePoint = { x: number; y: number };

/**
 * A profile turned about the Y axis: every point becomes a ring of corners, and each two rings in a
 * row a band of the surface between them.
 *
 * The profile goes from the bottom up, so the way it faces is outwards: crossed with the way up the
 * profile, the facing points away from the axis. Each point faces between the two pieces of the
 * profile beside it, which rounds the surface across, except where a point is given twice in a row:
 * there each copy faces along its own piece, and the edge comes out hard, as the rim of a base does.
 *
 * The picture runs once round (`u`) and once up the profile by its length (`v`, down from the top),
 * so a label wrapped round a bottle is not stretched where the profile is steep.
 *
 * @internal
 */
export const buildLathe = (profile: readonly TLathePoint[], segments: number) => {
    const b = createGeometryBuilder();
    const count = profile.length;
    const same = (a: TLathePoint, c: TLathePoint): boolean => a.x === c.x && a.y === c.y;

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
