import { describe, expect, it } from 'bun:test';
import { createGeometry, updateGeometry } from '../src/geometry/create_geometry';
import { projectUvs } from '../src/geometry/build/project_uvs';
import { GEOMETRY_STRIDE } from '../src/geometry/types/t_geometry';
import { createScene } from '../src/scene/create_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TGeometry } from '../src/geometry';
import type { TGeometryData } from '../src/geometry/create_geometry';

/**
 * Picture places worked out from where the corners are: from above, as a box, round a cylinder and
 * round a ball, stretched over the shape or laid by the world's units.
 */

const made = (data: TGeometryData) => {
    const game = createTestGame();
    let geometry: TGeometry | null = null;
    startTestScene(game.store, 'Level', () => {
        geometry = createGeometry(data);
        return createScene();
    });
    const vertices = () => game.renderer.buffers.find((buffer) => buffer.handle === geometry!.vertexBuffer)!.data as Float32Array;
    return { ...game, geometry: geometry!, vertices };
};

/**
 * Triangles counter-clockwise as seen from outside a shape round the origin: each one turned round
 * when its facing points inwards.
 */
const outwards = (positions: number[], triangles: number[][]): number[] => {
    const at = (i: number) => positions.slice(i * 3, i * 3 + 3);
    return triangles.flatMap(([a, b, c]) => {
        const [pa, pb, pc] = [at(a), at(b), at(c)];
        const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
        const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const middle = [pa[0] + pb[0] + pc[0], pa[1] + pb[1] + pc[1], pa[2] + pb[2] + pc[2]];
        return n[0] * middle[0] + n[1] * middle[1] + n[2] * middle[2] >= 0 ? [a, b, c] : [a, c, b];
    });
};

/** A box of 2 a side with its eight corners shared by the three faces meeting at each. */
const CUBE = (() => {
    const positions: number[] = [];
    for (let i = 0; i < 8; i++) positions.push(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1);
    const faces = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]];
    return { positions, indices: outwards(positions, faces.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]])) };
})();

/** A tube of eight sides round the upright axis, its seam shared: no corner given twice. */
const TUBE = (() => {
    const sides = 8;
    const positions: number[] = [];
    for (let j = 0; j < 2; j++) {
        for (let i = 0; i < sides; i++) {
            const phi = (i / sides) * Math.PI * 2;
            positions.push(Math.cos(phi), j * 2, -Math.sin(phi));
        }
    }
    const triangles: number[][] = [];
    for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;
        triangles.push([i, next, sides + next], [i, sides + next, sides + i]);
    }
    return { positions, indices: outwards(positions.map((value, k) => (k % 3 === 1 ? value - 1 : value)), triangles), sides };
})();

const uvAt = (vertices: Float32Array, corner: number): [number, number] => [vertices[corner * GEOMETRY_STRIDE + 6], vertices[corner * GEOMETRY_STRIDE + 7]];
const positionAt = (vertices: Float32Array, corner: number): number[] => [...vertices.subarray(corner * GEOMETRY_STRIDE, corner * GEOMETRY_STRIDE + 3)];

describe('uvs worked out by name', () => {
    it("lays a box's picture on each face from outside, splitting the corners the faces share", () => {
        const { geometry, vertices } = made({ ...CUBE, uvs: 'box' });
        // Eight corners, each wanted at up to three places by the three faces at it; where two faces
        // want it at the same place it stays one.
        expect(geometry.vertexCount).toBeGreaterThan(8);
        expect(geometry.vertexCount).toBeLessThanOrEqual(24);
        expect(geometry.indexCount).toBe(36);
        const v = vertices();
        const find = (x: number, y: number, z: number, facing: [number, number, number]) => {
            for (let c = 0; c < geometry.vertexCount; c++) {
                const p = positionAt(v, c);
                if (p[0] !== x || p[1] !== y || p[2] !== z) continue;
                // The copy for this face is the one used by a triangle facing that way.
                for (let t = 0; t < geometry.indexCount; t += 3) {
                    const corners = [geometry.indices![t], geometry.indices![t + 1], geometry.indices![t + 2]];
                    if (!corners.includes(c)) continue;
                    const [a, b, d] = corners.map((k) => positionAt(v, k));
                    const n = [(b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])];
                    if (Math.sign(n[0]) === facing[0] && Math.sign(n[1]) === facing[1] && Math.sign(n[2]) === facing[2]) return uvAt(v, c);
                }
            }
            throw new Error('no such corner');
        };
        // The front, seen from in front: its top left at the picture's top left.
        expect(find(-1, 1, 1, [0, 0, 1])).toEqual([0, 0]);
        expect(find(1, -1, 1, [0, 0, 1])).toEqual([1, 1]);
        // The right side, seen from the right: its near edge on the left of the picture.
        expect(find(1, 1, 1, [1, 0, 0])).toEqual([0, 0]);
        expect(find(1, -1, -1, [1, 0, 0])).toEqual([1, 1]);
        // The back, seen from behind: its left is the box's right.
        expect(find(1, 1, -1, [0, 0, -1])).toEqual([0, 0]);
        // The top, seen from above with the back away: the far left corner at the top left.
        expect(find(-1, 1, -1, [0, 1, 0])).toEqual([0, 0]);
        expect(find(1, 1, 1, [0, 1, 0])).toEqual([1, 1]);
        // The bottom, seen from below with the front away.
        expect(find(-1, -1, 1, [0, -1, 0])).toEqual([0, 0]);
    });

    it('keeps the facings of a split corner smooth, and its colour', () => {
        const colors = Array.from({ length: 8 }, (_, i) => [i / 7, 0, 0, 1]).flat();
        const { geometry, vertices, renderer } = made({ ...CUBE, uvs: 'box', colors });
        const v = vertices();
        const painted = new Uint8Array((renderer.buffers.find((buffer) => buffer.handle === geometry.colorBuffer)!.data as Uint32Array).buffer);
        const facing = new Map<number, string>();
        for (let c = 0; c < geometry.vertexCount; c++) {
            const [x, y, z] = positionAt(v, c);
            const was = (x > 0 ? 1 : 0) | (y > 0 ? 2 : 0) | (z > 0 ? 4 : 0);
            // Every copy of a corner faces as the others, outwards, with no crease between faces.
            const n = [...v.subarray(c * GEOMETRY_STRIDE + 3, c * GEOMETRY_STRIDE + 6)].map((value) => value.toFixed(5)).join();
            expect(facing.get(was) ?? n).toBe(n);
            facing.set(was, n);
            expect(painted[c * 4]).toBe(Math.round((was / 7) * 255));
        }
        expect(facing.size).toBe(8);
    });

    it('lays a picture from above, stretched over the shape or by the units of the world', () => {
        const square = { positions: [-2, 0, 1, 2, 0, 1, 2, 0, -1, -2, 0, -1], indices: [0, 1, 2, 0, 2, 3] };
        const fitted = made({ ...square, uvs: 'planar' });
        expect(fitted.geometry.vertexCount).toBe(4);
        expect([0, 1, 2, 3].map((c) => uvAt(fitted.vertices(), c))).toEqual([[0, 1], [1, 1], [1, 0], [0, 0]]);

        const laid = made({ ...square, uvs: 'planar', uvScale: 0.5 });
        expect([0, 1, 2, 3].map((c) => uvAt(laid.vertices(), c))).toEqual([[-1, 0.5], [1, 0.5], [1, -0.5], [-1, -0.5]]);
    });

    it('goes once round a cylinder, the seam split so no band reads the picture backwards', () => {
        const { geometry, vertices } = made({ positions: TUBE.positions, indices: TUBE.indices, uvs: 'cylinder' });
        // The two corners on the seam, given once, each wanted at 0 and at 1.
        expect(geometry.vertexCount).toBe(TUBE.sides * 2 + 2);
        const v = vertices();
        for (let t = 0; t < geometry.indexCount; t += 3) {
            const us = [0, 1, 2].map((k) => uvAt(v, geometry.indices![t + k])[0]);
            expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(1 / TUBE.sides, 5);
        }
        const all = Array.from({ length: geometry.vertexCount }, (_, c) => uvAt(v, c));
        expect(Math.min(...all.map(([u]) => u))).toBeCloseTo(0, 6);
        expect(Math.max(...all.map(([u]) => u))).toBeCloseTo(1, 6);
        // Down the height: the top ring at the top of the picture.
        expect(all.filter(([, vv]) => vv === 0)).toHaveLength(TUBE.sides + 1);
        // Round the way a lathe's picture runs: a little past the start is to the right, toward -z.
        const start = all.findIndex(([u]) => u > 0 && u < 0.2);
        expect(positionAt(v, start)[2]).toBeLessThan(0);
    });

    it('goes round a whole number of times by the units of the world, so the seam meets itself', () => {
        // Round a tube of radius 1: 2π units, laid once a unit, is six times round.
        const { geometry, vertices } = made({ positions: TUBE.positions, indices: TUBE.indices, uvs: 'cylinder', uvScale: 1 });
        const us = Array.from({ length: geometry.vertexCount }, (_, c) => uvAt(vertices(), c)[0]);
        expect(Math.max(...us)).toBeCloseTo(6, 5);
        expect(uvAt(vertices(), 0)[1]).toBeCloseTo(0, 6);
    });

    it('gives a corner on the axis the middle of the others, rather than smearing its triangles', () => {
        // A pyramid of four sides with its point straight above the middle.
        const positions = [1, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 1, 0, 1, 0];
        const indices = outwards(positions.map((value, k) => (k % 3 === 1 ? value - 0.5 : value)), [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]);
        const uvs = projectUvs(Float32Array.from(positions), Uint16Array.from(indices), 'sphere');
        for (let t = 0; t < indices.length; t += 3) {
            const corners = [0, 1, 2].map((k) => uvs.indices[t + k]);
            const tip = corners.find((c) => uvs.source[c] === 4)!;
            const base = corners.filter((c) => c !== tip).map((c) => uvs.uvs[c * 2]);
            expect(uvs.uvs[tip * 2]).toBeCloseTo((base[0] + base[1]) / 2, 6);
            // The tip at the top of the picture.
            expect(uvs.uvs[tip * 2 + 1]).toBeCloseTo(0, 6);
        }
    });

    it('works the picture out again from where the corners are when the shape changes', () => {
        const strip = (y: number) => ({ positions: [0, y, 0, 1, y, 0, 1, y, -1], uvs: 'planar' as const, uvScale: 1 });
        const { geometry, vertices } = made(strip(0));
        updateGeometry(geometry, { ...strip(3), positions: [5, 3, 0, 6, 3, 0, 6, 3, -1] });
        // Laid by the world, so the sand moves with where it is.
        expect(uvAt(vertices(), 0)).toEqual([5, 0]);
        expect(uvAt(vertices(), 2)).toEqual([6, -1]);
    });

    it('splits for the picture and then for the facets when flat', () => {
        const { geometry } = made({ ...CUBE, uvs: 'box', flat: true });
        expect(geometry.vertexCount).toBe(36);
    });

    it('says what is wrong in its own terms', () => {
        expect(() => made({ ...CUBE, uvs: 'cube' as never })).toThrow("'uvs' is 'cube', and the ways to work them out are 'planar', 'box', 'cylinder', 'sphere'");
        expect(() => made({ ...CUBE, uvScale: 2 })).toThrow("'uvScale' lays a picture worked out by name");
        expect(() => made({ ...CUBE, uvs: 'box', uvScale: 0 })).toThrow("'uvScale' is 0");
        // Given ones are still counted against the corners.
        expect(() => made({ ...CUBE, uvs: [0, 0] })).toThrow("'uvs' has 2 numbers for 8 corners");
    });
});
