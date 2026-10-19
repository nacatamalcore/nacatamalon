import { describe, expect, it } from 'bun:test';
import { computeDetail, DETAIL_STRIDE, GEOMETRY_STRIDE } from '../src/geometry';
import { buildCube } from '../src/geometry/shapes/cube';
import { buildPlane } from '../src/geometry/shapes/plane';
import { buildUvSphere } from '../src/geometry/shapes/uv_sphere';

/**
 * The detail run every shape carries: which way across its surface the picture runs, which hand its
 * down goes in, and a second picture coordinate. A material that moves the picture over a surface
 * reads these, so they have to be a true frame: square to the facing, one long, and pointing where
 * the picture's across points.
 */

const frameOf = (vertices: Float32Array, detail: Float32Array, i: number) => {
    const v = i * GEOMETRY_STRIDE;
    const d = i * DETAIL_STRIDE;
    return {
        normal: [vertices[v + 3]!, vertices[v + 4]!, vertices[v + 5]!],
        uv: [vertices[v + 6]!, vertices[v + 7]!],
        tangent: [detail[d]!, detail[d + 1]!, detail[d + 2]!],
        hand: detail[d + 3]!,
        uv2: [detail[d + 4]!, detail[d + 5]!],
    };
};

const dot = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

describe('the detail worked out for a shape', () => {
    it('gives every corner of a cube a tangent one long and square to its facing', () => {
        const { vertices, indices } = buildCube(1, 1, 1);
        const detail = computeDetail(vertices, indices);
        const count = vertices.length / GEOMETRY_STRIDE;

        expect(detail).toHaveLength(count * DETAIL_STRIDE);
        for (let i = 0; i < count; i++) {
            const { normal, tangent, hand } = frameOf(vertices, detail, i);
            expect(Math.hypot(...tangent)).toBeCloseTo(1, 5);
            expect(dot(normal, tangent)).toBeCloseTo(0, 5);
            expect(Math.abs(hand)).toBe(1);
        }
    });

    it('points the tangent where the picture runs across, on a flat floor', () => {
        const { vertices, indices } = buildPlane(2, 2, 1, 1);
        const detail = computeDetail(vertices, indices);
        const count = vertices.length / GEOMETRY_STRIDE;

        // Find two corners that differ only in u, and check the tangent follows the way u grows.
        for (let i = 0; i < count; i++) {
            for (let j = 0; j < count; j++) {
                const a = frameOf(vertices, detail, i);
                const b = frameOf(vertices, detail, j);
                if (i === j || Math.abs(a.uv[1]! - b.uv[1]!) > 1e-6 || b.uv[0]! <= a.uv[0]!) continue;
                const v = i * GEOMETRY_STRIDE;
                const w = j * GEOMETRY_STRIDE;
                const along = [vertices[w]! - vertices[v]!, vertices[w + 1]! - vertices[v + 1]!, vertices[w + 2]! - vertices[v + 2]!];
                expect(dot(a.tangent, along)).toBeGreaterThan(0);
            }
        }
    });

    it('keeps a smooth sphere a frame everywhere, poles included', () => {
        const { vertices, indices } = buildUvSphere(1, 16, 8);
        const detail = computeDetail(vertices, indices);
        const count = vertices.length / GEOMETRY_STRIDE;
        for (let i = 0; i < count; i++) {
            const { normal, tangent } = frameOf(vertices, detail, i);
            expect(Number.isFinite(tangent[0]!)).toBe(true);
            expect(Math.hypot(...tangent)).toBeCloseTo(1, 4);
            expect(dot(normal, tangent)).toBeCloseTo(0, 4);
        }
    });

    it('turns the hand over when the picture is mirrored', () => {
        const { vertices, indices } = buildPlane(2, 2, 1, 1);
        const mirrored = vertices.slice();
        for (let i = 0; i < mirrored.length; i += GEOMETRY_STRIDE) {
            mirrored[i + 6] = 1 - mirrored[i + 6]!;
        }
        const plain = computeDetail(vertices, indices);
        const flipped = computeDetail(mirrored, indices);
        expect(flipped[3]).toBe(-plain[3]!);
    });

    it('copies the first picture coordinate into the second when there is no other', () => {
        const { vertices, indices } = buildCube(1, 1, 1);
        const detail = computeDetail(vertices, indices);
        for (let i = 0; i < vertices.length / GEOMETRY_STRIDE; i++) {
            const { uv, uv2 } = frameOf(vertices, detail, i);
            expect(uv2).toEqual(uv);
        }
    });
});

describe('the detail a file brings', () => {
    it('keeps its own tangents and second coordinates as they are', () => {
        const { vertices, indices } = buildPlane(1, 1, 1, 1);
        const count = vertices.length / GEOMETRY_STRIDE;
        const tangents = new Float32Array(count * 4);
        const uv2 = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
            tangents.set([0, 0, 1, -1], i * 4);
            uv2.set([0.25, 0.75], i * 2);
        }
        const detail = computeDetail(vertices, indices, tangents, uv2);
        for (let i = 0; i < count; i++) {
            const { tangent, hand, uv2: second } = frameOf(vertices, detail, i);
            expect(tangent).toEqual([0, 0, 1]);
            expect(hand).toBe(-1);
            expect(second).toEqual([0.25, 0.75]);
        }
    });
});
