import { describe, expect, it } from 'bun:test';
import { buildParts } from '../src/loaders/gltf/build_parts';
import { findMeshNodes } from '../src/loaders/gltf/find_mesh_nodes';
import { DETAIL_STRIDE } from '../src/geometry';
import { asGltf } from './helpers/test_gltf';
import type { TGltfDoc } from '../src/loaders/gltf/types/t_gltf_doc';
import type { TShading } from '../src/loaders';
import type { TTestModel, TTestPrimitive } from './helpers/test_gltf';

/**
 * A file's own tangents and second picture coordinates, and what a piece gets when it has none.
 */

const QUAD: TTestPrimitive = {
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
};

const build = (primitive: TTestPrimitive, shading: TShading = 'auto') => {
    const model: TTestModel = { nodes: [{ name: 'Quad', primitives: [primitive] }] };
    const { json, bin } = asGltf(model);
    const doc = json as TGltfDoc;
    return buildParts(doc, [bin], findMeshNodes(doc), shading)[0]!;
};

describe('a piece of a file', () => {
    it('leaves the detail to the engine when the file has neither', () => {
        expect(build(QUAD).detail).toBeNull();
    });

    it('keeps the file\'s own tangents and second coordinates', () => {
        const part = build({
            ...QUAD,
            tangents: [0, 1, 0, -1, 0, 1, 0, -1, 0, 1, 0, -1, 0, 1, 0, -1],
            uvs2: [0.5, 0.5, 0.6, 0.5, 0.6, 0.6, 0.5, 0.6],
        });
        const detail = part.detail!;
        expect(detail).toHaveLength(4 * DETAIL_STRIDE);
        expect(Array.from(detail.subarray(0, DETAIL_STRIDE)).map((n) => Math.round(n * 100) / 100)).toEqual([0, 1, 0, -1, 0.5, 0.5]);
    });

    it('works out the tangents when the file brings only second coordinates', () => {
        const part = build({ ...QUAD, uvs2: [0, 0, 2, 0, 2, 2, 0, 2] });
        const detail = part.detail!;
        // u runs along +x on this quad, so the tangent worked out does too.
        expect(detail[0]).toBeCloseTo(1, 5);
        expect(detail[1]).toBeCloseTo(0, 5);
        expect(detail[4 + DETAIL_STRIDE]).toBeCloseTo(2, 5);
    });

    it('splits the second coordinates with the corners when shaded flat', () => {
        const part = build({ ...QUAD, uvs2: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2, 0.1, 0.2] }, 'flat');
        // Six corners now, one per triangle point, each still with its own second coordinate.
        expect(part.detail).toHaveLength(6 * DETAIL_STRIDE);
        expect(part.detail![DETAIL_STRIDE * 5 + 4]).toBeCloseTo(0.1, 5);
        expect(part.detail![DETAIL_STRIDE * 5 + 5]).toBeCloseTo(0.2, 5);
    });
});
