import { describe, expect, it } from 'bun:test';
import { createGeometry, updateGeometry } from '../src/geometry/create_geometry';
import { mergeGeometries } from '../src/geometry/merge_geometries';
import { COLOR_STRIDE, DETAIL_STRIDE, GEOMETRY_STRIDE } from '../src/geometry/types/t_geometry';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useSphereGeometry } from '../src/hooks/geometry/use_sphere_geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { destroy, flushDestroyed } from '../src/destroy';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TGeometry } from '../src/geometry';
import type { TMergePiece } from '../src/geometry/merge_geometries';

/**
 * Several shapes made one, each where it sits: its corners moved, its facings turned with it, a
 * mirrored one turned back the right way out, and a colour of its own painted on its corners.
 */

type TFakeRenderer = ReturnType<typeof createTestGame>['renderer'];

/** Runs `body` inside a scene body, the only place shapes are made, and hands back what it made. */
const inScene = <T,>(body: () => T) => {
    const game = createTestGame();
    let out: T | null = null;
    startTestScene(game.store, 'Level', () => {
        out = body();
        return createScene();
    });
    return { ...game, out: out as T };
};

const dataOf = <T extends Float32Array | Uint8Array | Uint16Array | Uint32Array>(renderer: TFakeRenderer, handle: unknown): T =>
    renderer.buffers.find((buffer) => buffer.handle === handle)!.data as T;

const runs = (renderer: TFakeRenderer, geometry: TGeometry) => ({
    vertices: dataOf<Float32Array>(renderer, geometry.vertexBuffer).subarray(0, geometry.vertexCount * GEOMETRY_STRIDE),
    indices: dataOf<Uint16Array | Uint32Array>(renderer, geometry.indexBuffer).subarray(0, geometry.indexCount),
    colors: new Uint8Array(dataOf<Uint32Array>(renderer, geometry.colorBuffer).buffer).subarray(0, geometry.vertexCount * COLOR_STRIDE),
    detail: dataOf<Float32Array>(renderer, geometry.detailBuffer).subarray(0, geometry.vertexCount * DETAIL_STRIDE),
});

/**
 * For every triangle, how its first corner's facing sits against the face its corners make: the
 * sign of the two agreeing (1 when the triangle is seen from the side it faces), and how far the
 * facing leans off the face's own (0 for a flat face lit as it lies).
 */
const facings = ({ vertices, indices }: { vertices: Float32Array; indices: Uint16Array | Uint32Array }) => {
    const out: Array<{ agrees: number; lean: number }> = [];
    const at = (i: number, k: number) => vertices[indices[i] * GEOMETRY_STRIDE + k];
    for (let t = 0; t < indices.length; t += 3) {
        const e1 = [at(t + 1, 0) - at(t, 0), at(t + 1, 1) - at(t, 1), at(t + 1, 2) - at(t, 2)];
        const e2 = [at(t + 2, 0) - at(t, 0), at(t + 2, 1) - at(t, 1), at(t + 2, 2) - at(t, 2)];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const length = Math.hypot(n[0], n[1], n[2]);
        if (length < 1e-9) continue;
        const dot = (n[0] * at(t, 3) + n[1] * at(t, 4) + n[2] * at(t, 5)) / length;
        out.push({ agrees: Math.sign(dot), lean: 1 - Math.abs(dot) });
    }
    return out;
};

describe('mergeGeometries', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => mergeGeometries([])).toThrow('[NacatamalOn] mergeGeometries: called where nothing is being built');
    });

    it('lays each piece where it sits, one run of corners and triangles after another', () => {
        const { renderer, out } = inScene(() => {
            const cube = useCubeGeometry();
            return { cube, merged: mergeGeometries([{ geometry: cube, x: -3 }, { geometry: cube, x: 3, y: 1 }]) };
        });
        const { cube, merged } = out;
        expect(merged.vertexCount).toBe(cube.vertexCount * 2);
        expect(merged.indexCount).toBe(cube.indexCount * 2);
        expect(merged.source).toBeNull();
        expect(merged.bounds).toEqual({ min: { x: -3.5, y: -0.5, z: -0.5 }, max: { x: 3.5, y: 1.5, z: 0.5 } });

        const { vertices, indices } = runs(renderer, merged);
        const own = runs(renderer, cube);
        // The second piece's triangles count its corners after the first's.
        expect(Array.from(indices.subarray(cube.indexCount))).toEqual(Array.from(own.indices, (i) => i + cube.vertexCount));
        // Moved, not turned: same facings and picture places.
        for (let c = 0; c < cube.vertexCount; c++) {
            const a = c * GEOMETRY_STRIDE;
            const b = (cube.vertexCount + c) * GEOMETRY_STRIDE;
            expect(vertices[a]).toBeCloseTo(own.vertices[a] - 3);
            expect(vertices[b + 1]).toBeCloseTo(own.vertices[a + 1] + 1);
            expect(Array.from(vertices.subarray(b + 3, b + 8))).toEqual(Array.from(own.vertices.subarray(a + 3, a + 8)));
        }
        expect(facings({ vertices, indices }).every(({ agrees, lean }) => agrees === 1 && lean < 1e-5)).toBe(true);
    });

    it('turns the facings with a piece turned and stretched, so each face is still lit as it lies', () => {
        const place = { rotationY: 0.7, rotationX: -0.4, rotation: 0.2, scaleX: 3, scaleY: 0.5, scaleZ: 1.7 };
        const { renderer, out } = inScene(() => {
            // A slanted face too: a cube's facings all lie along its axes, which a stretch alone
            // does not lean, so only a slanted one shows the stretch leaning it the wrong way.
            const slant = createGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 1], flat: true });
            return mergeGeometries([{ geometry: useCubeGeometry(), ...place }, { geometry: slant, ...place }]);
        });
        const merged = runs(renderer, out);
        const faces = facings(merged);
        expect(faces).toHaveLength(13);
        // Turned by the placement alone, a stretched slanted face's facing would lean off it.
        expect(faces.every(({ agrees, lean }) => agrees === 1 && lean < 1e-5)).toBe(true);
        for (let c = 0; c < out.vertexCount; c++) {
            const at = c * GEOMETRY_STRIDE;
            expect(Math.hypot(merged.vertices[at + 3], merged.vertices[at + 4], merged.vertices[at + 5])).toBeCloseTo(1, 5);
        }
    });

    it('turns a mirrored piece back the right way out, facing out and seen from outside', () => {
        const { renderer, out } = inScene(() => mergeGeometries([{ geometry: useCubeGeometry(), x: 5, scaleX: -2, scaleZ: 0.5 }]));
        const merged = runs(renderer, out);
        expect(facings(merged).every(({ agrees, lean }) => agrees === 1 && lean < 1e-5)).toBe(true);
        for (let c = 0; c < out.vertexCount; c++) {
            const at = c * GEOMETRY_STRIDE;
            const outward = (merged.vertices[at] - 5) * merged.vertices[at + 3] + merged.vertices[at + 1] * merged.vertices[at + 4] + merged.vertices[at + 2] * merged.vertices[at + 5];
            expect(outward).toBeGreaterThan(0);
        }
    });

    it('turns a piece by a quaternion as by the angles it stands for, and one turned and mirrored back the right way out', () => {
        const half = 0.6 / 2;
        const { renderer, out } = inScene(() => {
            const cube = useCubeGeometry();
            return {
                byAngle: mergeGeometries([{ geometry: cube, rotationY: 0.6 }]),
                byQuaternion: mergeGeometries([{ geometry: cube, quaternion: [0, Math.sin(half), 0, Math.cos(half)] }]),
                mirrored: mergeGeometries([{ geometry: cube, rotationX: 0.8, rotationY: -1.1, scaleY: -1.5, scaleX: 0.7 }]),
            };
        });
        const angle = runs(renderer, out.byAngle).vertices;
        const quaternion = runs(renderer, out.byQuaternion).vertices;
        for (let i = 0; i < angle.length; i++) {
            expect(quaternion[i]).toBeCloseTo(angle[i], 5);
        }
        const mirrored = runs(renderer, out.mirrored);
        expect(facings(mirrored).every(({ agrees, lean }) => agrees === 1 && lean < 1e-5)).toBe(true);
        for (let c = 0; c < out.mirrored.vertexCount; c++) {
            const at = c * GEOMETRY_STRIDE;
            const v = mirrored.vertices;
            expect(v[at] * v[at + 3] + v[at + 1] * v[at + 4] + v[at + 2] * v[at + 5]).toBeGreaterThan(0);
        }
    });

    it('paints each piece its tint, on top of the colour its corners had, and white where it has none', () => {
        const { renderer, out } = inScene(() => {
            const painted = createGeometry({
                positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                colors: [1, 0.5, 0, 1, 1, 0.5, 0, 1, 1, 0.5, 0, 1],
            });
            const cube = useCubeGeometry();
            return {
                cube,
                tinted: mergeGeometries([{ geometry: cube, tint: '#ff0000' }, { geometry: cube }, { geometry: painted, tint: { r: 1, g: 1, b: 1, a: 0.5 } }]),
                plain: mergeGeometries([{ geometry: cube }]),
            };
        });
        const { colors } = runs(renderer, out.tinted);
        const corner = (c: number) => Array.from(colors.subarray(c * COLOR_STRIDE, c * COLOR_STRIDE + 4));
        expect(corner(0)).toEqual([255, 0, 0, 255]);
        expect(corner(out.cube.vertexCount)).toEqual([255, 255, 255, 255]);
        expect(corner(out.cube.vertexCount * 2)).toEqual([255, 128, 0, 128]);
        expect(runs(renderer, out.plain).colors.every((byte) => byte === 255)).toBe(true);
    });

    it('keeps a second picture place, and gives a piece without one its first', () => {
        const { renderer, out } = inScene(() => {
            const flat = createGeometry({
                positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                uvs: [0, 1, 1, 1, 0, 0],
                uv2: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
            });
            const cube = useCubeGeometry();
            return { cube, merged: mergeGeometries([{ geometry: cube }, { geometry: flat, y: 2 }]) };
        });
        const { vertices, detail } = runs(renderer, out.merged);
        const second = (c: number) => Array.from(detail.subarray(c * DETAIL_STRIDE + 4, c * DETAIL_STRIDE + 6));
        for (let c = 0; c < out.cube.vertexCount; c++) {
            expect(second(c)).toEqual([vertices[c * GEOMETRY_STRIDE + 6], vertices[c * GEOMETRY_STRIDE + 7]]);
        }
        expect(second(out.cube.vertexCount)[0]).toBeCloseTo(0.1);
        expect(second(out.cube.vertexCount + 2)[1]).toBeCloseTo(0.6);
    });

    it('keeps the second places of a faceted shape of its own, split with its corners', () => {
        const { renderer, out } = inScene(() => {
            const faceted = createGeometry({
                positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
                indices: [0, 1, 2, 2, 1, 3],
                uv2: [0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4],
                flat: true,
            });
            return { faceted, merged: mergeGeometries([{ geometry: faceted, x: 1 }]) };
        });
        expect(out.merged.vertexCount).toBe(out.faceted.vertexCount);
        const own = runs(renderer, out.faceted).detail;
        const merged = runs(renderer, out.merged).detail;
        for (let c = 0; c < out.merged.vertexCount; c++) {
            expect(merged[c * DETAIL_STRIDE + 4]).toBeCloseTo(own[c * DETAIL_STRIDE + 4]);
            expect(merged[c * DETAIL_STRIDE + 5]).toBeCloseTo(own[c * DETAIL_STRIDE + 5]);
        }
    });

    it('builds a shape hook\'s corners once however many pieces wear it', async () => {
        const kept = await import('../src/geometry/kept_corners');
        const { out } = inScene(() => {
            const cube = useCubeGeometry({ width: 3 });
            let reads = 0;
            const read = kept.cornersOf;
            kept.keepCorners(cube, () => {
                reads += 1;
                return read.call(null, useCubeGeometry({ width: 3, key: 'other-cube' }));
            });
            mergeGeometries([{ geometry: cube }, { geometry: cube, x: 4 }, { geometry: cube, x: 8 }]);
            return reads;
        });
        expect(out).toBe(1);
    });

    it('reads a shape hook\'s picture laid by name, and a shape of its own as it last was', () => {
        const { renderer, out } = inScene(() => {
            const boxed = useCubeGeometry({ width: 2, uvs: 'box', uvScale: 0.5 });
            const own = createGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] });
            updateGeometry(own, { positions: [0, 0, 0, 4, 0, 0, 0, 4, 0, 4, 4, 0], indices: [0, 1, 2, 2, 1, 3] });
            return { boxed, own, merged: mergeGeometries([{ geometry: boxed }, { geometry: own }]) };
        });
        const merged = runs(renderer, out.merged);
        const boxed = runs(renderer, out.boxed);
        expect(out.merged.vertexCount).toBe(out.boxed.vertexCount + 4);
        expect(Array.from(merged.vertices.subarray(0, boxed.vertices.length))).toEqual(Array.from(boxed.vertices));
        expect(merged.vertices[(out.boxed.vertexCount + 3) * GEOMETRY_STRIDE]).toBe(4);
    });

    it('merges a merge, and what it makes is the object\'s own: changed in place, and gone with it', () => {
        const { store, renderer } = createTestGame();
        let thing: ReturnType<ReturnType<typeof useSpawn>> | null = null;
        let twice: TGeometry | null = null;
        startTestScene(store, 'Level', () => {
            thing = useSpawn(() => {
                useTransform({});
                const cube = useCubeGeometry();
                const once = mergeGeometries([{ geometry: cube }, { geometry: cube, x: 2 }]);
                twice = mergeGeometries([{ geometry: once }, { geometry: once, z: 2 }]);
                createMesh({ geometry: twice });
            })();
            return createScene();
        });
        expect(twice!.vertexCount).toBe(96);
        expect(twice!.bounds).toEqual({ min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 2.5, y: 0.5, z: 2.5 } });
        updateGeometry(twice!, { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] });
        expect(twice!.vertexCount).toBe(3);

        const held = renderer.buffers.filter((buffer) => [twice!.vertexBuffer, twice!.indexBuffer, twice!.colorBuffer, twice!.detailBuffer].includes(buffer.handle));
        destroy(thing!);
        flushDestroyed(store);
        expect(held.every((buffer) => !buffer.alive)).toBe(true);
        expect(store.get('assets').geometries.has(twice!.key)).toBe(false);
    });

    it('takes the wide indices once the pieces have more corners than the narrow ones hold', () => {
        const { out } = inScene(() => {
            const ball = useSphereGeometry();
            const pieces: TMergePiece[] = [];
            const need = Math.ceil(65536 / ball.vertexCount);
            for (let i = 0; i < need; i++) pieces.push({ geometry: ball, x: i });
            return mergeGeometries(pieces);
        });
        expect(out.vertexCount).toBeGreaterThan(65535);
        expect(out.indexType).toBe('uint32');
    });

    it('says which piece cannot be merged, and why', () => {
        const fake = (patch: Partial<TGeometry>): TGeometry => Object.assign(inScene(() => useCubeGeometry()).out, patch);
        const merge = (pieces: TMergePiece[]) => inScene(() => mergeGeometries(pieces));
        expect(() => merge([])).toThrow('mergeGeometries: no pieces');
        expect(() => merge([{} as TMergePiece])).toThrow('piece 0 has no geometry');
        expect(() => merge([{ geometry: fake({}) }, { geometry: fake({ source: { kind: 'gltf', src: 'car.glb' } }) }]))
            .toThrow("piece 1, 'cube:1:1:1', is a piece of a model file");
        expect(() => merge([{ geometry: fake({ status: 'loading' }) }])).toThrow('is still loading');
        expect(() => merge([{ geometry: fake({ skinBuffer: { resourceType: 'buffer' } }) }])).toThrow('is moved by bones');
        expect(() => merge([{ geometry: useless() }])).toThrow('was let go of with the object that made it');
        expect(() => merge([{ geometry: fake({}), x: Number.NaN }])).toThrow('piece 0 is placed at something that is not a number');
        expect(() => merge([{ geometry: fake({}), scaleY: 0 }])).toThrow('piece 0 has a scale of 0 one way');
    });
});

/** A shape made by an object that is gone since. */
const useless = (): TGeometry => {
    const { store } = createTestGame();
    let thing: ReturnType<ReturnType<typeof useSpawn>> | null = null;
    let geometry: TGeometry | null = null;
    startTestScene(store, 'Level', () => {
        thing = useSpawn(() => {
            useTransform({});
            geometry = createGeometry({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] });
        })();
        return createScene();
    });
    destroy(thing!);
    flushDestroyed(store);
    return geometry!;
};
