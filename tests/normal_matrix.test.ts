import { describe, expect, it } from 'bun:test';
import * as mat from '../src/math/mat4';
import { buildParts } from '../src/loaders/gltf/build_parts';
import { findMeshNodes } from '../src/loaders/gltf/find_mesh_nodes';
import { GEOMETRY_STRIDE } from '../src/geometry';
import { asGltf } from './helpers/test_gltf';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';

/**
 * A surface's facing has to stay square to the surface however the surface is placed. Turned or
 * scaled evenly, the placement itself turns it right; stretched more one way than another, only its
 * inverse flipped does. These pin that, where a model is drawn and where a model file is read.
 */

const turnBy = (m: Float32Array, [x, y, z]: number[]): number[] =>
    [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: number[]): number[] => {
    const length = Math.hypot(v[0], v[1], v[2]);
    return v.map((n) => n / length);
};
const scaled = (x: number, y: number, z: number): Float32Array => mat.scale(mat.create(), { x, y, z });

describe('the matrix that turns a facing', () => {
    it('keeps a facing square to its surface when the surface is stretched one way', () => {
        // A slope, x + y = 0: along it (1, -1, 0), facing (1, 1, 0). Stretched twice as wide.
        const model = scaled(2, 1, 1);
        const along = turnBy(model, [1, -1, 0]);
        const facing = turnBy(mat.normalMatrix(model), [1, 1, 0]);

        expect(dot(unit(along), unit(facing))).toBeCloseTo(0, 6);
        // Leaning towards y, the way the flatter slope faces, not still at 45 degrees.
        expect(Math.abs(facing[1])).toBeGreaterThan(Math.abs(facing[0]));
    });

    it('is the plain turn when the size is even, at its own length', () => {
        const turn = mat.rotateY(mat.create(), 0.7);
        const model = mat.multiply(turn, scaled(3, 3, 3));
        const out = mat.normalMatrix(model);
        for (const at of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
            expect(out[at]).toBeCloseTo(turn[at], 6);
        }
    });

    it('mirrors a facing with the surface, and leaves a flattened axis at zero', () => {
        const mirrored = mat.normalMatrix(scaled(-1, 1, 1));
        expect([mirrored[0], mirrored[5], mirrored[10]]).toEqual([-1, 1, 1]);

        const flat = mat.normalMatrix(scaled(0, 2, 1));
        expect([flat[0], flat[5], flat[10]]).toEqual([0, 1, 1]);

        // The same written into the matrix it reads.
        const itself = scaled(0, 2, 1);
        mat.normalMatrix(itself, itself);
        expect([itself[0], itself[5], itself[10], itself[12], itself[15]]).toEqual([0, 1, 1, 0, 1]);
    });

    it('is the inverse flipped, at a length of its own, for a model mirrored and stretched at once', () => {
        // Mirrored the way a flat world turns a model upright, turned, and stretched unevenly.
        const model = mat.multiply(scaled(1, -1, 1), mat.multiply(mat.rotateY(mat.create(), 0.7), scaled(2, 1, 0.5)));
        const out = mat.normalMatrix(model);
        const exact = mat.transpose(mat.invert(model));
        // One number apart, and a positive one: a facing that flipped side would make it negative.
        const ratio = out[0] / exact[0];
        expect(ratio).toBeGreaterThan(0);
        for (const at of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
            expect(out[at]).toBeCloseTo(exact[at] * ratio, 5);
        }
    });

    it('writes only its 3x3 and leaves the rest of what it is given as the identity', () => {
        const out = new Float32Array(16).fill(9);
        mat.normalMatrix(scaled(2, 1, 1), out);
        expect([out[3], out[7], out[11], out[12], out[13], out[14], out[15]]).toEqual([0, 0, 0, 0, 0, 0, 1]);
    });
});

describe('a piece of a model file stretched more one way than another', () => {
    it('faces square to its own surface once it is read', () => {
        // A square facing +z, turned 45 degrees about y inside a parent twice as wide.
        const half = Math.PI / 8;
        const { json, bin } = asGltf({
            nodes: [
                { name: 'Wide', scale: [2, 1, 1], children: [1] },
                {
                    name: 'Square',
                    rotation: [0, Math.sin(half), 0, Math.cos(half)],
                    primitives: [{
                        positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
                        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
                        indices: [0, 1, 2, 0, 2, 3],
                    }],
                },
            ],
            roots: [0],
        });
        const doc = json as TGltfDoc;
        const [part] = buildParts(doc, [bin], findMeshNodes(doc), 'auto');

        const corner = (i: number): number[] => [...part.vertices.slice(i * GEOMETRY_STRIDE, i * GEOMETRY_STRIDE + 3)];
        const facing = [...part.vertices.slice(3, 6)];
        const across = corner(1).map((n, k) => n - corner(0)[k]);
        const up = corner(3).map((n, k) => n - corner(0)[k]);

        expect(Math.hypot(facing[0], facing[1], facing[2])).toBeCloseTo(1, 5);
        expect(dot(facing, unit(across))).toBeCloseTo(0, 5);
        expect(dot(facing, unit(up))).toBeCloseTo(0, 5);
    });

    it('keeps its own tangents along the surface, square to its facing', () => {
        const half = Math.PI / 8;
        const { json, bin } = asGltf({
            nodes: [
                { name: 'Wide', scale: [2, 1, 1], children: [1] },
                {
                    name: 'Square',
                    rotation: [0, Math.sin(half), 0, Math.cos(half)],
                    primitives: [{
                        positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
                        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
                        tangents: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
                        uvs: [0, 0, 1, 0, 1, 1, 0, 1],
                        indices: [0, 1, 2, 0, 2, 3],
                    }],
                },
            ],
            roots: [0],
        });
        const doc = json as TGltfDoc;
        const [part] = buildParts(doc, [bin], findMeshNodes(doc), 'auto');

        const facing = [...part.vertices.slice(3, 6)];
        const across = [...part.vertices.slice(GEOMETRY_STRIDE, GEOMETRY_STRIDE + 3)].map((n, k) => n - part.vertices[k]);
        // The tangent opens the detail run of each corner.
        const tangent = [...part.detail!.slice(0, 3)];
        expect(dot(unit(tangent), unit(across))).toBeCloseTo(1, 5);
        expect(dot(facing, unit(tangent))).toBeCloseTo(0, 5);
    });
});
