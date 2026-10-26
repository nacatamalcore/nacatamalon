/**
 * How a shape's picture places are worked out from where its corners are, rather than given.
 *
 * - `'planar'`: seen from above, `x` across and `z` down: a terrain, a floor, a field.
 * - `'box'`: each triangle from the side it faces most, as the six faces of a box: a rock, a
 *   building, a wall.
 * - `'cylinder'`: once round the upright axis and down its height: a trunk, a column, a barrel.
 * - `'sphere'`: round by longitude and down by latitude: a planet, a head.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUvProjection = 'planar' | 'box' | 'cylinder' | 'sphere';

/**
 * Every projection there is, to check a name against.
 *
 * @internal
 */
export const UV_PROJECTIONS: readonly TUvProjection[] = ['planar', 'box', 'cylinder', 'sphere'];

/**
 * How close two picture places of one corner are to be taken as the same, and the corner not split.
 */
const SAME = 1e-6;

type TBounds = { min: [number, number, number]; max: [number, number, number]; size: [number, number, number] };

const boundsOf = (positions: Float32Array): TBounds => {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
        for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], positions[i + k]);
            max[k] = Math.max(max[k], positions[i + k]);
        }
    }
    // A shape with no depth on an axis is stretched over 1 there rather than divided by nothing.
    const size: [number, number, number] = [max[0] - min[0] || 1, max[1] - min[1] || 1, max[2] - min[2] || 1];
    return { min, max, size };
};

/**
 * The way round the upright axis, from 0 to 1, growing to the right as the side is seen from outside:
 * the way a lathe's picture runs, so a shape turned and one projected read their picture alike.
 */
const roundOf = (dx: number, dz: number): number => {
    const turn = Math.atan2(-dz, dx) / (Math.PI * 2);
    return turn < 0 ? turn + 1 : turn;
};

/**
 * The picture places round an axis for one triangle, mended where it crosses the seam and where a
 * corner sits on the axis itself.
 *
 * Across the seam, one corner is near 1 and the next near 0, and the triangle between would read the
 * whole picture backwards: the corners near 0 are taken past 1 instead. A corner on the axis has no
 * way round of its own, and any one it is given smears its triangles: it takes the middle of the
 * other two.
 */
const mendRound = (u: [number, number, number], onAxis: [boolean, boolean, boolean]): void => {
    const round = [0, 1, 2].filter((k) => !onAxis[k]);
    if (round.length === 0) {
        u[0] = u[1] = u[2] = 0;
        return;
    }
    const lowest = Math.min(...round.map((k) => u[k]));
    const highest = Math.max(...round.map((k) => u[k]));
    if (highest - lowest > 0.5) {
        for (const k of round) {
            if (u[k] < 0.5) {
                u[k] += 1;
            }
        }
    }
    const middle = round.reduce((sum, k) => sum + u[k], 0) / round.length;
    for (let k = 0; k < 3; k++) {
        if (onAxis[k]) {
            u[k] = middle;
        }
    }
};

/**
 * Works out the picture places of a shape from where its corners are, splitting a corner in two
 * where the triangles meeting at it want it at two places of the picture: the edge of a box between
 * two faces, the seam round a cylinder.
 *
 * Without `scale`, the picture is stretched once over the box round the shape (once round, for
 * `'cylinder'` and `'sphere'`). With it, it is laid `scale` times every unit of the world, from the
 * world's own origin, so two shapes side by side carry on each other's bricks, and a shape that moves
 * its corners keeps its sand where it was. Round an axis it is rounded to whole times, so the seam
 * meets itself.
 *
 * @returns A picture place per corner of the shape now (`u, v`), which corner it was before, and the
 *   triangles numbered for the corners there are now.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const projectUvs = (
    positions: Float32Array,
    indices: Uint16Array | Uint32Array,
    projection: TUvProjection,
    scale?: number,
): { uvs: Float32Array; source: Uint32Array; indices: Uint32Array } => {
    const { min, max, size } = boundsOf(positions);
    const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const fit = scale === undefined;
    const s = scale ?? 1;

    // How many times round, for a projection round an axis: whole, so the seam meets itself.
    let reach = 0;
    if (projection === 'cylinder' || projection === 'sphere') {
        for (let i = 0; i < positions.length; i += 3) {
            const dx = positions[i] - centre[0];
            const dy = projection === 'sphere' ? positions[i + 1] - centre[1] : 0;
            const dz = positions[i + 2] - centre[2];
            reach = Math.max(reach, Math.hypot(dx, dy, dz));
        }
    }
    const timesRound = fit ? 1 : Math.max(1, Math.round(Math.PI * 2 * reach * s));
    const timesDown = fit ? 1 : Math.max(1, Math.round(Math.PI * reach * s));
    // Nearer the axis than this, a corner is on it.
    const onAxisWithin = Math.max(reach, 1e-9) * 1e-6;

    const at = (corner: number, k: number): number => positions[corner * 3 + k];
    // Along an axis of the world: from the box's near side, stretched over it, or in world units.
    const along = (value: number, k: number): number => (fit ? (value - min[k]) / size[k] : value * s);
    const against = (value: number, k: number): number => (fit ? (max[k] - value) / size[k] : -value * s);

    const u: [number, number, number] = [0, 0, 0];
    const v: [number, number, number] = [0, 0, 0];
    const onAxis: [boolean, boolean, boolean] = [false, false, false];

    const triangleUvs = (t: number): void => {
        const corners = [indices[t], indices[t + 1], indices[t + 2]];
        if (projection === 'planar') {
            for (let k = 0; k < 3; k++) {
                u[k] = along(at(corners[k], 0), 0);
                v[k] = along(at(corners[k], 2), 2);
            }
            return;
        }
        if (projection === 'box') {
            // The side the triangle faces most, from the order of its corners.
            const [a, b, c] = corners;
            const e1 = [at(b, 0) - at(a, 0), at(b, 1) - at(a, 1), at(b, 2) - at(a, 2)];
            const e2 = [at(c, 0) - at(a, 0), at(c, 1) - at(a, 1), at(c, 2) - at(a, 2)];
            const nx = e1[1] * e2[2] - e1[2] * e2[1];
            const ny = e1[2] * e2[0] - e1[0] * e2[2];
            const nz = e1[0] * e2[1] - e1[1] * e2[0];
            const ax = Math.abs(nx);
            const ay = Math.abs(ny);
            const az = Math.abs(nz);
            for (let k = 0; k < 3; k++) {
                const x = at(corners[k], 0);
                const y = at(corners[k], 1);
                const z = at(corners[k], 2);
                // Each face read as it is seen from outside: across to the right, down the picture.
                if (ax > ay && ax >= az) {
                    u[k] = nx > 0 ? against(z, 2) : along(z, 2);
                    v[k] = against(y, 1);
                } else if (az > ay && az > ax) {
                    u[k] = nz > 0 ? along(x, 0) : against(x, 0);
                    v[k] = against(y, 1);
                } else {
                    u[k] = along(x, 0);
                    v[k] = ny >= 0 ? along(z, 2) : against(z, 2);
                }
            }
            return;
        }
        for (let k = 0; k < 3; k++) {
            const dx = at(corners[k], 0) - centre[0];
            const dy = at(corners[k], 1) - centre[1];
            const dz = at(corners[k], 2) - centre[2];
            onAxis[k] = Math.hypot(dx, dz) <= onAxisWithin;
            u[k] = roundOf(dx, dz);
            if (projection === 'cylinder') {
                v[k] = against(at(corners[k], 1), 1);
            } else {
                const length = Math.hypot(dx, dy, dz) || 1;
                v[k] = (Math.acos(Math.min(Math.max(dy / length, -1), 1)) / Math.PI) * timesDown;
            }
        }
        mendRound(u, onAxis);
        for (let k = 0; k < 3; k++) {
            u[k] *= timesRound;
        }
    };

    // Each corner as many times as the triangles at it want it in different places of the picture.
    const copies = new Map<number, number[]>();
    const outUvs: number[] = [];
    const outSource: number[] = [];
    const outIndices = new Uint32Array(indices.length);
    for (let t = 0; t + 2 < indices.length; t += 3) {
        triangleUvs(t);
        for (let k = 0; k < 3; k++) {
            const corner = indices[t + k];
            const known = copies.get(corner) ?? [];
            let copy = known.find((c) => Math.abs(outUvs[c * 2] - u[k]) < SAME && Math.abs(outUvs[c * 2 + 1] - v[k]) < SAME);
            if (copy === undefined) {
                copy = outSource.length;
                outSource.push(corner);
                outUvs.push(u[k], v[k]);
                known.push(copy);
                copies.set(corner, known);
            }
            outIndices[t + k] = copy;
        }
    }

    return { uvs: Float32Array.from(outUvs), source: Uint32Array.from(outSource), indices: outIndices };
};
