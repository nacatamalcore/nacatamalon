import { describe, expect, it } from 'bun:test';
import { buildParts } from '../src/loaders/gltf/build_parts';
import { findMeshNodes } from '../src/loaders/gltf/find_mesh_nodes';
import { readGltfContainer } from '../src/loaders/gltf/read_container';
import { GEOMETRY_STRIDE } from '../src/geometry';
import { asGlb, asGltf } from './helpers/test_gltf';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';
import type { TShading } from '../src/loaders';
import type { TTestModel } from './helpers/test_gltf';

/**
 * How a loaded model is made to face, read straight off the corners that go to the card. The
 * record kept afterwards holds only where the corners are, so the facings have to be checked here,
 * at the one place they are decided.
 */

/**
 * Two triangles meeting along a bent edge, so smooth and flat cannot give the same answer.
 */
const BENT: TTestModel = {
    nodes: [{
        name: 'Bend',
        primitives: [{
            positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1],
            // Deliberately pointing along x, which no face here does: it tells "kept" from "worked out".
            normals: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
            indices: [0, 1, 2, 1, 3, 2],
        }],
    }],
};

/**
 * The corners a model turns into, without going anywhere near a graphics card.
 */
const build = (model: TTestModel, shading: TShading = 'auto') => {
    const { json, bin } = asGltf(model);
    const doc = json as TGltfDoc;
    return buildParts(doc, [bin], findMeshNodes(doc), shading);
};

/**
 * Every corner's facing, read out of the interleaved run.
 */
const normalsOf = (vertices: Float32Array): Array<[number, number, number]> => {
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < vertices.length; i += GEOMETRY_STRIDE) {
        out.push([vertices[i + 3], vertices[i + 4], vertices[i + 5]]);
    }
    return out;
};

describe('shading', () => {
    it('keeps the facings the file wrote down, by default', () => {
        const [part] = build(BENT);

        // All four still point along x, wrong as that is: nothing was recomputed behind anyone's back.
        for (const [nx, ny, nz] of normalsOf(part.vertices)) {
            expect([nx, ny, nz]).toEqual([1, 0, 0]);
        }
    });

    it('throws the file away and works them out when asked for smooth', () => {
        const [part] = build(BENT, 'smooth');
        const normals = normalsOf(part.vertices);

        expect(normals.some(([nx]) => nx === 1)).toBe(false);
        // Worked out or not, a facing is always a direction: length one, every one of them.
        for (const [nx, ny, nz] of normals) {
            expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1);
        }
    });

    it('works them out when the file gives none, so the model is not drawn black', () => {
        const [part] = build({
            nodes: [{ name: 'Bare', primitives: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }] }],
        });

        // A triangle in the xy plane faces the viewer.
        for (const [nx, ny, nz] of normalsOf(part.vertices)) {
            expect([nx, ny, nz]).toEqual([0, 0, 1]);
        }
    });

    it('gives each triangle its own corners and its own facing for flat', () => {
        const [part] = build(BENT, 'flat');
        const normals = normalsOf(part.vertices);

        // Six triangle points became six corners of their own: nothing is shared any more.
        expect(part.vertices.length / GEOMETRY_STRIDE).toBe(6);
        expect(Array.from(part.indices)).toEqual([0, 1, 2, 3, 4, 5]);
        // Within a triangle the three agree; between the two bent ones they do not.
        expect(normals[0]).toEqual(normals[1]);
        expect(normals[1]).toEqual(normals[2]);
        expect(normals[0]).not.toEqual(normals[3]);
    });

    it('averages the corners two faces share, gathered by where they are and not by their number', () => {
        // The same point written twice, as a picture seam does, with a face on each copy.
        const [part] = build({
            nodes: [{
                name: 'Seam',
                primitives: [{
                    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -1, 0, 0],
                    indices: [0, 1, 2, 3, 4, 5],
                }],
            }],
        }, 'smooth');
        const normals = normalsOf(part.vertices);

        // Corners 0 and 3 are the same point written twice, so they must come out facing alike.
        expect(normals[0][0]).toBeCloseTo(normals[3][0]);
        expect(normals[0][1]).toBeCloseTo(normals[3][1]);
        expect(normals[0][2]).toBeCloseTo(normals[3][2]);
    });
});

describe('the placement worked into the corners', () => {
    it('turns the facings by whatever turned the piece', () => {
        // A quarter turn about x: a face looking at the viewer ends up looking up.
        const [part] = build({
            nodes: [{
                name: 'Turned',
                rotation: [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)],
                primitives: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2] }],
            }],
        });

        const [nx, ny, nz] = normalsOf(part.vertices)[0];
        expect(nx).toBeCloseTo(0);
        expect(ny).toBeCloseTo(-1);
        expect(nz).toBeCloseTo(0);
    });

    it('leaves a piece with no placement exactly where it was drawn', () => {
        const [part] = build({ nodes: [{ name: 'Still', primitives: [{ positions: [2, 3, 4], indices: [0] }] }] });

        expect([part.vertices[0], part.vertices[1], part.vertices[2]]).toEqual([2, 3, 4]);
    });
});

describe('the two shapes of the file', () => {
    it('read to the same corners', () => {
        const text = build(BENT);
        const { doc, embedded } = readGltfContainer(asGlb(BENT));
        const binary = buildParts(doc, [embedded!], findMeshNodes(doc), 'auto');

        expect(Array.from(binary[0].vertices)).toEqual(Array.from(text[0].vertices));
        expect(Array.from(binary[0].indices)).toEqual(Array.from(text[0].indices));
    });
});
