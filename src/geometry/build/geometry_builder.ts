/**
 * Collects corners and triangles and hands back the two runs of numbers the graphics card wants.
 *
 * Every shape in this folder is built with one of these rather than writing the arrays by hand,
 * because a triangle whose corners are listed the wrong way round is invisible: the card throws away
 * the ones facing away, and a shape half built backwards looks like a bug in the lighting.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGeometryBuilder = {
    /**
     * Adds one corner and gives back its number, to make triangles with.
     */
    addVertex(px: number, py: number, pz: number, nx: number, ny: number, nz: number, u: number, v: number): number;
    addTriangle(a: number, b: number, c: number): void;
    build(): { vertices: Float32Array; indices: Uint16Array };
};

export const createGeometryBuilder = (): TGeometryBuilder => {
    const vertices: number[] = [];
    const indices: number[] = [];
    let count = 0;

    return {
        addVertex(px, py, pz, nx, ny, nz, u, v) {
            vertices.push(px, py, pz, nx, ny, nz, u, v);
            return count++;
        },
        addTriangle(a, b, c) {
            indices.push(a, b, c);
        },
        build() {
            return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
        },
    };
};

/**
 * One flat four-cornered face.
 *
 * `u` and `v` are the two directions across the face, and they have to be given so that `u` crossed
 * with `v` is the way the face looks: that is what makes the corners come out in the order that
 * leaves the face visible from outside.
 *
 * The picture's `v` runs along **minus** `v`, because a picture's first row is its top while `+v`
 * points up the face. Reading it the other way puts every picture on a flat face upside down.
 *
 * @internal
 */
export const addQuadFace = (
    b: TGeometryBuilder,
    center: { x: number; y: number; z: number },
    normal: [number, number, number],
    u: [number, number, number],
    v: [number, number, number],
    halfU: number,
    halfV: number,
): void => {
    const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const uvs: Array<[number, number]> = [[0, 1], [1, 1], [1, 0], [0, 0]];

    const made = corners.map(([su, sv], i) => {
        const x = center.x + (u[0] * su * halfU + v[0] * sv * halfV);
        const y = center.y + (u[1] * su * halfU + v[1] * sv * halfV);
        const z = center.z + (u[2] * su * halfU + v[2] * sv * halfV);
        return b.addVertex(x, y, z, ...normal, ...uvs[i]);
    });

    b.addTriangle(made[0], made[1], made[2]);
    b.addTriangle(made[0], made[2], made[3]);
};

/**
 * One ring of corners around the Y axis: a disc's rim, a ball's line of latitude, a pipe's section.
 *
 * `segments + 1` corners, not `segments`: the first and the last sit on top of each other on
 * purpose, so whoever joins two rings can count from 0 to `segments` without wrapping, and so the
 * picture can run all the way round instead of jumping back at the seam.
 *
 * @internal
 */
export const addRing = (
    b: TGeometryBuilder,
    segments: number,
    point: (phi: number) => [number, number, number],
    normal: (phi: number) => [number, number, number],
    uvV: number,
): number[] =>
    Array.from({ length: segments + 1 }, (_, i) => {
        const phi = (i / segments) * Math.PI * 2;
        const [x, y, z] = point(phi);
        return b.addVertex(x, y, z, ...normal(phi), i / segments, uvV);
    });

/**
 * Joins two rings into a tube.
 *
 * The order of the corners here is **not** the one the flat face uses. The obvious guess is
 * backwards and the whole tube is thrown away as facing the wrong way, which is what happened to
 * core's cylinder and torus until someone looked at them.
 *
 * @internal
 */
export const addRingQuads = (b: TGeometryBuilder, ring: number[], nextRing: number[]): void => {
    for (let i = 0; i < ring.length - 1; i++) {
        b.addTriangle(ring[i], nextRing[i + 1], ring[i + 1]);
        b.addTriangle(ring[i], nextRing[i], nextRing[i + 1]);
    }
};

/**
 * A flat disc: a middle corner and a rim, facing up (`1`) or down (`-1`). The order flips with it,
 * so a lid and a base are both visible from their own side.
 *
 * @internal
 */
export const addDiskFan = (b: TGeometryBuilder, centerY: number, radius: number, segments: number, normalY: 1 | -1): void => {
    const center = b.addVertex(0, centerY, 0, 0, normalY, 0, 0.5, 0.5);
    const rim = addRing(
        b, segments,
        (phi) => [Math.cos(phi) * radius, centerY, -Math.sin(phi) * radius],
        () => [0, normalY, 0],
        0.5,
    );

    for (let i = 0; i < segments; i++) {
        if (normalY === 1) {
            b.addTriangle(center, rim[i], rim[i + 1]);
        } else {
            b.addTriangle(center, rim[i + 1], rim[i]);
        }
    }
};
