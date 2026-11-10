import { describe, expect, it } from 'bun:test';
import { createGeometry, updateGeometry } from '../src/geometry/create_geometry';
import { buildLathe } from '../src/geometry/shapes/lathe';
import { buildCylinder } from '../src/geometry/shapes/cylinder';
import { DETAIL_STRIDE, GEOMETRY_STRIDE } from '../src/geometry/types/t_geometry';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { useLatheGeometry } from '../src/hooks/geometry/use_lathe_geometry';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { destroy, flushDestroyed } from '../src/destroy';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TGeometry } from '../src/geometry';
import type { TGeometryData } from '../src/geometry/create_geometry';
import type { TMesh } from '../src/gameobjects/mesh';

/**
 * A shape given corner by corner, changed while the game runs, and one turned on a lathe.
 */

/**
 * Makes a shape inside a scene body, which is the only place it can be made.
 */
const made = (data: TGeometryData) => {
    const game = createTestGame();
    let geometry: TGeometry | null = null;
    startTestScene(game.store, 'Level', () => {
        geometry = createGeometry(data);
        return createScene();
    });
    return { ...game, geometry: geometry! };
};

/** A square lying flat, facing up: two triangles, counter-clockwise seen from above. */
const SQUARE: TGeometryData = {
    positions: [-1, 0, 1, 1, 0, 1, 1, 0, -1, -1, 0, -1],
    indices: [0, 1, 2, 0, 2, 3],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
};

/**
 * Which way each triangle faces by the order of its corners, against the way its first corner says
 * it faces: positive when the two agree.
 */
const windingAgrees = ({ vertices, indices }: { vertices: Float32Array; indices: Uint16Array | Uint32Array }): number[] => {
    const out: number[] = [];
    const at = (i: number, k: number) => vertices[indices[i] * GEOMETRY_STRIDE + k];
    for (let t = 0; t < indices.length; t += 3) {
        const e1 = [at(t + 1, 0) - at(t, 0), at(t + 1, 1) - at(t, 1), at(t + 1, 2) - at(t, 2)];
        const e2 = [at(t + 2, 0) - at(t, 0), at(t + 2, 1) - at(t, 1), at(t + 2, 2) - at(t, 2)];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (Math.hypot(n[0], n[1], n[2]) < 1e-9) continue;
        out.push(Math.sign(n[0] * at(t, 3) + n[1] * at(t, 4) + n[2] * at(t, 5)));
    }
    return out;
};

describe('createGeometry', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => createGeometry(SQUARE)).toThrow('[NacatamalOn] createGeometry: called where nothing is being built');
    });

    it('puts the corners on the card, measured, with their facing worked out', () => {
        const { geometry, renderer } = made(SQUARE);
        expect(geometry.vertexCount).toBe(4);
        expect(geometry.indexCount).toBe(6);
        expect(geometry.indexType).toBe('uint16');
        expect(geometry.source).toBeNull();
        expect(geometry.bounds).toEqual({ min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 0, z: 1 } });
        const vertices = renderer.buffers.find((buffer) => buffer.handle === geometry.vertexBuffer)!.data as Float32Array;
        // Facing up, from the order of the corners, and its picture where it was asked.
        expect([...vertices.subarray(3, 8)]).toEqual([0, 1, 0, 0, 1]);
    });

    it('makes a triangle of every three corners when it is given no indices', () => {
        const { geometry } = made({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] });
        expect(geometry.indexCount).toBe(3);
        expect([...geometry.indices!]).toEqual([0, 1, 2]);
    });

    it('paints the corners as asked, and white otherwise', () => {
        const { geometry, renderer } = made({ ...SQUARE, colors: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 0.5] });
        const colors = new Uint8Array((renderer.buffers.find((buffer) => buffer.handle === geometry.colorBuffer)!.data as Uint32Array).buffer);
        expect([...colors.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
        expect([...colors.subarray(12, 16)]).toEqual([255, 255, 255, 128]);

        const plain = made(SQUARE);
        const white = new Uint8Array((plain.renderer.buffers.find((buffer) => buffer.handle === plain.geometry.colorBuffer)!.data as Uint32Array).buffer);
        expect([...white].every((byte) => byte === 255)).toBe(true);
    });

    it('gives every triangle its own corners and facing when flat', () => {
        const { geometry } = made({ ...SQUARE, flat: true });
        expect(geometry.vertexCount).toBe(6);
        expect(geometry.indexCount).toBe(6);
    });

    it('takes the wide indices when there are more corners than the narrow ones hold', () => {
        const positions = new Float32Array(66000 * 3);
        for (let i = 0; i < 66000; i++) positions[i * 3] = i;
        const { geometry } = made({ positions, indices: [0, 65999, 1] });
        expect(geometry.indexType).toBe('uint32');
    });

    it('says what is wrong with a shape in its own terms', () => {
        expect(() => made({ positions: [0, 0] })).toThrow("'positions' has 2 numbers, and it takes three a corner");
        expect(() => made({ ...SQUARE, uvs: [0, 0, 1] })).toThrow("'uvs' has 3 numbers for 4 corners, and it takes 2 a corner (8)");
        expect(() => made({ ...SQUARE, indices: [0, 1, 7] })).toThrow('index 2 is 7, and there are corners 0 to 3');
        expect(() => made({ ...SQUARE, indices: [0, 1, 2, 3] })).toThrow('4 indices do not make whole triangles');
    });

    it('belongs to the object that made it, and goes with it', () => {
        const { store, renderer } = createTestGame();
        let thing: ReturnType<ReturnType<typeof useSpawn>> | null = null;
        let geometry: TGeometry | null = null;
        startTestScene(store, 'Level', () => {
            thing = useSpawn(() => {
                useTransform({});
                geometry = createGeometry(SQUARE);
                createMesh({ geometry });
            })();
            return createScene();
        });
        const held = renderer.buffers.filter((buffer) => [geometry!.vertexBuffer, geometry!.indexBuffer, geometry!.colorBuffer, geometry!.detailBuffer].includes(buffer.handle));
        expect(held).toHaveLength(4);
        expect(store.get('assets').geometries.get(geometry!.key)).toBe(geometry!);

        destroy(thing!);
        flushDestroyed(store);

        expect(held.every((buffer) => !buffer.alive)).toBe(true);
        expect(geometry!.vertexBuffer).toBeNull();
        expect(store.get('assets').geometries.has(geometry!.key)).toBe(false);
    });
});

describe('updateGeometry', () => {
    it('writes over what the card holds while the shape fits, and measures it again', () => {
        const { geometry, renderer } = made(SQUARE);
        const buffer = renderer.buffers.find((entry) => entry.handle === geometry.vertexBuffer)!;

        updateGeometry(geometry, { ...SQUARE, positions: [-1, 2, 1, 1, 2, 1, 1, 2, -1, -1, 2, -1] });

        expect(geometry.vertexBuffer).toBe(buffer.handle);
        expect(buffer.writes).toBe(1);
        expect(geometry.bounds!.min.y).toBe(2);
        expect(geometry.positions![1]).toBe(2);
    });

    it('takes new room, with some to spare, when the shape outgrows it', () => {
        const triangles = (count: number) => ({ positions: Array.from({ length: count * 9 }, (_, i) => (i % 3 === 0 ? i : 0)) });
        const { geometry, renderer } = made(triangles(1));
        const before = renderer.buffers.find((entry) => entry.handle === geometry.vertexBuffer)!;

        updateGeometry(geometry, triangles(3));

        expect(before.alive).toBe(false);
        expect(geometry.vertexBuffer).not.toBe(before.handle);
        expect(geometry.vertexCount).toBe(9);
        expect(geometry.indexCount).toBe(9);
        const after = renderer.buffers.find((entry) => entry.handle === geometry.vertexBuffer)!;
        expect(after.data.length).toBeGreaterThan(9 * GEOMETRY_STRIDE);

        // And then a little more fits in place.
        updateGeometry(geometry, triangles(4));
        expect(geometry.vertexBuffer).toBe(after.handle);
        expect(geometry.indexCount).toBe(12);
    });

    it('refuses a shape that is shared, or one whose object is gone', () => {
        const { store } = createTestGame();
        let cube: TGeometry | null = null;
        startTestScene(store, 'Level', () => {
            cube = useCubeGeometry();
            return createScene();
        });
        expect(() => updateGeometry(cube!, SQUARE)).toThrow('was not made by createGeometry');
    });
});

describe('useLatheGeometry', () => {
    const BOTTLE = [{ x: 0, y: 0 }, { x: 0.4, y: 0 }, { x: 0.4, y: 0 }, { x: 0.4, y: 1.2 }, { x: 0.15, y: 1.6 }, { x: 0.12, y: 2 }];

    it('faces outwards, the way the cylinder does', () => {
        const cylinder = windingAgrees(buildCylinder(0.5, 1, 12));
        const lathe = windingAgrees(buildLathe(BOTTLE, 12));
        expect(new Set(cylinder)).toEqual(new Set([1]));
        expect(new Set(lathe)).toEqual(new Set([1]));
    });

    it('points each side corner away from the axis, and the base down', () => {
        const { vertices } = buildLathe([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }], 8);
        for (let c = 0; c < vertices.length / GEOMETRY_STRIDE; c++) {
            const at = c * GEOMETRY_STRIDE;
            const [x, y, z, nx, ny, nz] = vertices.subarray(at, at + 6);
            if (y > 0) {
                // The wall: square to the axis, out.
                expect(nx * x + nz * z).toBeGreaterThan(0);
                expect(Math.abs(ny)).toBeLessThan(1e-6);
            } else if (Math.hypot(x, z) < 0.5) {
                // The middle of the base, facing down.
                expect(ny).toBeCloseTo(-1);
            }
        }
    });

    it('is one shape however many ask for the same profile', () => {
        const { store } = createTestGame();
        const asked: TGeometry[] = [];
        startTestScene(store, 'Level', () => {
            asked.push(useLatheGeometry({ profile: BOTTLE }), useLatheGeometry({ profile: BOTTLE }), useLatheGeometry({ profile: BOTTLE, segments: 6 }));
            return createScene();
        });
        expect(asked[0]).toBe(asked[1]);
        expect(asked[2]).not.toBe(asked[0]);
        expect(asked[0].source).toEqual({ kind: 'lathe', profile: BOTTLE, segments: 32 });
    });

    it('says what is wrong with a profile', () => {
        const ask = (profile: Array<{ x: number; y: number }>) => () => {
            const { store } = createTestGame();
            startTestScene(store, 'Level', () => {
                useLatheGeometry({ profile });
                return createScene();
            });
        };
        expect(ask([{ x: 0, y: 0 }])).toThrow('the profile needs two points at least');
        expect(ask([{ x: 0, y: 0 }, { x: -1, y: 1 }])).toThrow('profile point 1 is (-1, 1)');
    });

    it('is written in a scene document as its recipe and made again from it', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Vase() {
                useTransform({});
                createMesh({ geometry: useLatheGeometry({ profile: BOTTLE, segments: 10 }) });
            })();
            return createScene();
        });
        const doc = serializeScene(root);
        const entry = doc.assets.find((asset) => asset.type === 'geometry');
        expect(entry).toMatchObject({ source: { kind: 'lathe', profile: BOTTLE, segments: 10 } });
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);

        const again = createTestGame();
        const built = startTestScene(again.store, 'Level', sceneFromDoc(doc));
        const mesh = built.children[0]!.drawables.find((drawable) => drawable.type === 'mesh') as TMesh;
        expect(mesh.geometry!.source).toEqual({ kind: 'lathe', profile: BOTTLE, segments: 10 });
        expect(mesh.geometry!.indexCount).toBeGreaterThan(0);
    });

    it('drops a profile in a document that is not one', () => {
        const parsed = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Level',
            assets: [{ type: 'geometry', key: 'bad', source: { kind: 'lathe', profile: [{ x: 0, y: 0 }, { x: 'far', y: 1 }] } }],
            root: { id: 'root', name: 'Level', transform: null, components: [], children: [] },
        }, '/scenes/level.scene');
        expect(parsed.assets.filter((asset) => asset.type === 'geometry')).toHaveLength(0);
    });
});

describe('a second picture coordinate, uv2', () => {
    /** The second places on the card, two a corner, from the detail run where they ride. */
    const secondOf = (renderer: ReturnType<typeof made>['renderer'], geometry: TGeometry): number[] => {
        const detail = renderer.buffers.find((buffer) => buffer.handle === geometry.detailBuffer)!.data as Float32Array;
        const out: number[] = [];
        for (let c = 0; c < geometry.vertexCount; c++) {
            out.push(detail[c * DETAIL_STRIDE + 4], detail[c * DETAIL_STRIDE + 5]);
        }
        return out;
    };
    const UV2 = [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5];

    it('puts each corner\'s second place on the card, and the first again when there is none', () => {
        const given = made({ ...SQUARE, uv2: UV2 });
        expect(secondOf(given.renderer, given.geometry)).toEqual(UV2);
        const left = made(SQUARE);
        expect(secondOf(left.renderer, left.geometry)).toEqual([0, 1, 1, 1, 1, 0, 0, 0]);
    });

    it('refuses a list of the wrong length, saying what it should have been', () => {
        expect(() => made({ ...SQUARE, uv2: [0, 0, 1] })).toThrow("'uv2' has 3 numbers for 4 corners, and it takes 2 a corner (8)");
    });

    it('follows the corners when flat splits them', () => {
        const { renderer, geometry } = made({ ...SQUARE, uv2: UV2, flat: true });
        // One corner per triangle point, in the order of the triangles: 0 1 2, then 0 2 3.
        expect(secondOf(renderer, geometry)).toEqual([0, 0, 0.5, 0, 0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0.5]);
    });

    it('keeps a corner\'s second place when a picture worked out by name splits it', () => {
        // A cube's eight corners, split by the box layout into one per face: each split corner keeps
        // the second place of the corner it came from, which is its own place here.
        const positions = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
        const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 6, 2, 3, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
        const uv2 = Array.from({ length: 8 }, (_, c) => [c / 8, 1 - c / 8]).flat();
        const { renderer, geometry } = made({ positions, indices, uvs: 'box', uv2 });
        expect(geometry.vertexCount).toBeGreaterThan(8);
        const vertices = renderer.buffers.find((buffer) => buffer.handle === geometry.vertexBuffer)!.data as Float32Array;
        const second = secondOf(renderer, geometry);
        for (let c = 0; c < geometry.vertexCount; c++) {
            const p = [vertices[c * GEOMETRY_STRIDE], vertices[c * GEOMETRY_STRIDE + 1], vertices[c * GEOMETRY_STRIDE + 2]];
            const was = positions.findIndex((_, i) => i % 3 === 0 && positions[i] === p[0] && positions[i + 1] === p[1] && positions[i + 2] === p[2]) / 3;
            expect([second[c * 2], second[c * 2 + 1]]).toEqual([uv2[was * 2], uv2[was * 2 + 1]]);
        }
    });

    it('is changed by updateGeometry', () => {
        const { renderer, geometry } = made({ ...SQUARE, uv2: UV2 });
        updateGeometry(geometry, { ...SQUARE, uv2: [1, 1, 1, 1, 1, 1, 1, 1] });
        expect(secondOf(renderer, geometry)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
        updateGeometry(geometry, SQUARE);
        expect(secondOf(renderer, geometry)).toEqual([0, 1, 1, 1, 1, 0, 0, 0]);
    });
});
