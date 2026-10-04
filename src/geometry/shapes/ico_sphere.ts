import { createGeometryBuilder } from '../build/geometry_builder';
import type { TGeometryBuilder } from '../build/geometry_builder';

type Vec3 = [number, number, number];

const normalize = (v: Vec3, radius: number): Vec3 => {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [(v[0] / len) * radius, (v[1] / len) * radius, (v[2] / len) * radius];
};

const midpoint = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/**
 * Where on the picture a point of the ball is. The seam distorts, which a shape this simple accepts.
 */
const sphericalUv = (v: Vec3, radius: number): [number, number] => [
    0.5 + Math.atan2(v[2], v[0]) / (Math.PI * 2),
    0.5 - Math.asin(v[1] / radius) / Math.PI,
];

const addPoint = (b: TGeometryBuilder, v: Vec3, radius: number): number => {
    const [u, uvV] = sphericalUv(v, radius);
    return b.addVertex(v[0], v[1], v[2], v[0] / radius, v[1] / radius, v[2] / radius, u, uvV);
};

/**
 * Splits a triangle into four and pushes the new corners out onto the ball, again and again.
 *
 * Corners on a shared edge are not joined up: at twenty faces times four each time round, the
 * spare corners cost less than the bookkeeping to find them.
 */
const subdivide = (b: TGeometryBuilder, a: Vec3, c2: Vec3, c3: Vec3, depth: number, radius: number): void => {
    if (depth === 0) {
        b.addTriangle(addPoint(b, a, radius), addPoint(b, c2, radius), addPoint(b, c3, radius));
        return;
    }

    const ab = normalize(midpoint(a, c2), radius);
    const bc = normalize(midpoint(c2, c3), radius);
    const ca = normalize(midpoint(c3, a), radius);

    subdivide(b, a, ab, ca, depth - 1, radius);
    subdivide(b, c2, bc, ab, depth - 1, radius);
    subdivide(b, c3, ca, bc, depth - 1, radius);
    subdivide(b, ab, bc, ca, depth - 1, radius);
};

/**
 * A ball whose triangles are all about the same size, grown from a twenty-sided solid.
 *
 * The one to reach for when the surface is going to be lit or deformed: the globe-style ball has
 * tiny slivers at its poles and they show.
 *
 * @internal
 */
export const buildIcoSphere = (radius: number, subdivisions: number) => {
    const b = createGeometryBuilder();
    const t = (1 + Math.sqrt(5)) / 2;
    const raw: Vec3[] = [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ];
    const v = raw.map((p) => normalize(p, radius));

    const faces: Array<[number, number, number]> = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];

    for (const [ia, ib, ic] of faces) {
        subdivide(b, v[ia], v[ib], v[ic], subdivisions, radius);
    }

    return b.build();
};
