import { GEOMETRY_STRIDE } from '../../src/geometry/types/t_geometry';

/**
 * What a built shape's corners and triangles say about it as a solid, for the tests of the shape
 * hooks that make one.
 */

type TBuilt = { vertices: Float32Array; indices: Uint16Array | Uint32Array };

/** One corner's eight numbers: where it is, its facing, its picture place. */
export const corner = (vertices: Float32Array, i: number) => Array.from(vertices.subarray(i * GEOMETRY_STRIDE, i * GEOMETRY_STRIDE + 8));

/**
 * Whether the solid is closed, every side of every triangle met by another going the other way, and
 * how much it holds: positive when every triangle is seen from outside.
 */
export const solidOf = ({ vertices, indices }: TBuilt) => {
    const key = (i: number) => [0, 1, 2].map((k) => vertices[i * GEOMETRY_STRIDE + k]!.toFixed(6)).join(',');
    const sides = new Map<string, number>();
    let volume = 0;
    for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
        const p = [a, b, c].map((i) => corner(vertices, i));
        volume += (p[0]![0]! * (p[1]![1]! * p[2]![2]! - p[1]![2]! * p[2]![1]!)
            - p[0]![1]! * (p[1]![0]! * p[2]![2]! - p[1]![2]! * p[2]![0]!)
            + p[0]![2]! * (p[1]![0]! * p[2]![1]! - p[1]![1]! * p[2]![0]!)) / 6;
        for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
            const there = `${key(from)}>${key(to)}`;
            sides.set(there, (sides.get(there) ?? 0) + 1);
        }
    }
    let open = 0;
    for (const [side, count] of sides) {
        const [from, to] = side.split('>');
        if ((sides.get(`${to}>${from}`) ?? 0) !== count) open++;
    }
    return { closed: open === 0, volume };
};

/** For each triangle, whether its corners' facings agree with the way its corners go round. */
export const seenFromOutside = ({ vertices, indices }: TBuilt): boolean => {
    for (let t = 0; t < indices.length; t += 3) {
        const p = [indices[t]!, indices[t + 1]!, indices[t + 2]!].map((i) => corner(vertices, i));
        const e1 = [0, 1, 2].map((k) => p[1]![k]! - p[0]![k]!);
        const e2 = [0, 1, 2].map((k) => p[2]![k]! - p[0]![k]!);
        const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
        if (Math.hypot(n[0]!, n[1]!, n[2]!) < 1e-12) continue;
        for (const q of p) {
            if (n[0]! * q[3]! + n[1]! * q[4]! + n[2]! * q[5]! <= 0) return false;
        }
    }
    return true;
};
