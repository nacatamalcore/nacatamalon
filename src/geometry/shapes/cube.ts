import { addQuadFace, createGeometryBuilder } from '../build/geometry_builder';
import type { TGeometryBuilder } from '../build/geometry_builder';

type TVec = [number, number, number];

/**
 * How a box's edges are cut off: how far in from every face, and in how many steps across the
 * edge. `1` is a straight cut at 45°, more a rounded one.
 *
 * @internal
 */
export type TCubeBevel = { size: number; segments: number };

/**
 * One place across a face, along one of its two directions: how far from the middle the flat part
 * of the face reaches on that side (`inner`), and how far round the edge from there (`lean`, the
 * tangent of the angle round it, so `1` is the middle of the edge, where the next face takes over).
 */
type TStop = { inner: number; lean: number };

/**
 * The places across a face along one of its directions, from one edge's middle to the other's. A
 * rounded edge in `steps` of equal angle to each middle; a straight cut in one. Where the flat part
 * has no width left the two places at its ends are one, so no triangle of nothing is made there.
 */
const stopsOf = (half: number, size: number, steps: number): TStop[] => {
    const inner = half - size;
    const leans: number[] = [];
    for (let k = steps; k >= 1; k--) {
        // The middle of the edge exactly `1`, as the next face reaches it from its side: the
        // tangent of a quarter of π is a hair under.
        leans.push(k === steps ? 1 : Math.tan((k / steps) * (Math.PI / 4)));
    }
    const before = leans.map((lean) => ({ inner: -inner, lean: -lean }));
    const after = [...leans].reverse().map((lean) => ({ inner, lean }));
    const flat = inner > 0 ? [{ inner: -inner, lean: 0 }, { inner, lean: 0 }] : [{ inner: 0, lean: 0 }];
    return [...before, ...flat, ...after];
};

/**
 * One face of a box with its edges cut off: the flat part, and half of each cut edge and corner
 * round it, so it meets the next face in the middle of the edge between them. Its picture is laid
 * across all of it by length, as a flat face lays one.
 */
const addBevelledFace = (
    b: TGeometryBuilder,
    normal: TVec,
    u: TVec,
    v: TVec,
    halfU: number,
    halfV: number,
    halfN: number,
    bevel: TCubeBevel,
): void => {
    const { size } = bevel;
    const straight = bevel.segments === 1;
    const steps = straight ? 1 : Math.ceil(bevel.segments / 2);
    const across = stopsOf(halfU, size, steps);
    const up = stopsOf(halfV, size, steps);
    const innerN = halfN - size;

    // How far out along each way from the flat part a point is: on a circle round the edge (or a
    // ball round the corner) when it is rounded, on the flat cut when it is straight.
    const reach = (a: number, c: number): number => size / (straight ? Math.abs(a) + Math.abs(c) + 1 : Math.hypot(a, c, 1));
    const at = (s: TStop, t: TStop): TVec => {
        const r = reach(s.lean, t.lean);
        const du = s.inner + r * s.lean;
        const dv = t.inner + r * t.lean;
        const dn = innerN + r;
        return [
            u[0] * du + v[0] * dv + normal[0] * dn,
            u[1] * du + v[1] * dv + normal[1] * dn,
            u[2] * du + v[2] * dv + normal[2] * dn,
        ];
    };
    const facing = (a: number, c: number): TVec => {
        const length = Math.hypot(a, c, 1);
        return [
            (u[0] * a + v[0] * c + normal[0]) / length,
            (u[1] * a + v[1] * c + normal[1]) / length,
            (u[2] * a + v[2] * c + normal[2]) / length,
        ];
    };

    // The picture by how far along the face each place is, measured along its middle line.
    const along = (stops: TStop[]): number[] => {
        const lengths = [0];
        for (let i = 1; i < stops.length; i++) {
            const p = stops[i - 1]!;
            const q = stops[i]!;
            const rp = reach(p.lean, 0);
            const rq = reach(q.lean, 0);
            lengths.push(lengths[i - 1]! + Math.hypot(q.inner + rq * q.lean - (p.inner + rp * p.lean), rq - rp));
        }
        const total = lengths[lengths.length - 1]!;
        return lengths.map((length) => length / total);
    };
    const pu = along(across);
    const pv = along(up);

    if (straight) {
        // Each piece flat, with its own corners: the face, the cut along an edge at 45°, the
        // corner's cut facing out along all three.
        for (let i = 0; i + 1 < across.length; i++) {
            for (let j = 0; j + 1 < up.length; j++) {
                const n = facing(Math.sign(across[i]!.lean + across[i + 1]!.lean), Math.sign(up[j]!.lean + up[j + 1]!.lean));
                const corner = (ci: number, cj: number) => b.addVertex(...at(across[ci]!, up[cj]!), ...n, pu[ci]!, 1 - pv[cj]!);
                const p00 = corner(i, j);
                const p10 = corner(i + 1, j);
                const p11 = corner(i + 1, j + 1);
                const p01 = corner(i, j + 1);
                b.addTriangle(p00, p10, p11);
                b.addTriangle(p00, p11, p01);
            }
        }
        return;
    }

    // Rounded: one corner per place, facing straight out from the flat part, so the light runs
    // smoothly from the face round the edge.
    const grid: number[][] = across.map((s, i) => up.map((t, j) => b.addVertex(...at(s, t), ...facing(s.lean, t.lean), pu[i]!, 1 - pv[j]!)));
    for (let i = 0; i + 1 < across.length; i++) {
        for (let j = 0; j + 1 < up.length; j++) {
            b.addTriangle(grid[i]![j]!, grid[i + 1]![j]!, grid[i + 1]![j + 1]!);
            b.addTriangle(grid[i]![j]!, grid[i + 1]![j + 1]!, grid[i]![j + 1]!);
        }
    }
};

/**
 * A box, centred on nothing in particular: six flat faces, each looking outwards. With a bevel its
 * edges are cut `size` in from every face, so it still fills `width` by `height` by `depth`.
 *
 * @internal
 */
export const buildCube = (width: number, height: number, depth: number, bevel: TCubeBevel | null = null) => {
    const b = createGeometryBuilder();
    const hx = width / 2;
    const hy = height / 2;
    const hz = depth / 2;

    // Each face reads its picture upright as it is seen from outside, the way `uvs: 'box'` lays
    // one: across to the right and down, the sides with up as up, the top as seen from the front
    // (its far edge at the top of the picture) and the bottom as seen from below.
    const faces: Array<[TVec, TVec, TVec, number, number, number]> = [
        [[1, 0, 0], [0, 0, -1], [0, 1, 0], hz, hy, hx],
        [[-1, 0, 0], [0, 0, 1], [0, 1, 0], hz, hy, hx],
        [[0, 1, 0], [1, 0, 0], [0, 0, -1], hx, hz, hy],
        [[0, -1, 0], [1, 0, 0], [0, 0, 1], hx, hz, hy],
        [[0, 0, 1], [1, 0, 0], [0, 1, 0], hx, hy, hz],
        [[0, 0, -1], [-1, 0, 0], [0, 1, 0], hx, hy, hz],
    ];
    for (const [normal, u, v, halfU, halfV, halfN] of faces) {
        if (bevel === null) {
            addQuadFace(b, { x: normal[0] * halfN, y: normal[1] * halfN, z: normal[2] * halfN }, normal, u, v, halfU, halfV);
        } else {
            addBevelledFace(b, normal, u, v, halfU, halfV, halfN, bevel);
        }
    }

    return b.build();
};
