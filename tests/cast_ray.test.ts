import { describe, expect, it } from 'bun:test';
import { castRay } from '../src/camera/cast_ray';
import { rayOnPlane } from '../src/camera/ray_on_plane';
import { screenToRay } from '../src/camera/screen_to_ray';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh/create_mesh';
import { createMeshInstances } from '../src/gameobjects/mesh/create_mesh_instances';
import { destroy } from '../src/destroy/destroy';
import { useCubeGeometry } from '../src/hooks/geometry/use_cube_geometry';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { computeModelMatrix } from '../src/render/shared/compute_mvp_3d';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box/types/t_box';
import type { TCullMode } from '../src/materials/types/t_material';
import type { TRay } from '../src/camera/screen_to_ray';
import type { TTransform3d } from '../src/gameobjects/types/t_transform_3d';

/**
 * A ray against the models of a scene, with no physics: what it meets, nearest first, as they are
 * drawn; and against a plane without end.
 */

type TPlace = Partial<TTransform3d>;

/** A scene of named cubes, each in a box of its own placed where it says. */
const sceneOf = (cubes: Array<{ name: string; at: TPlace; cull?: TCullMode; size?: number; more?: () => void }>) => {
    const { store } = createTestGame();
    const root = startTestScene(store, 'Level', () => {
        for (const cube of cubes) {
            useSpawn(function Cube() {
                useTransform(cube.at);
                createMesh({ geometry: useCubeGeometry({ width: cube.size ?? 1, height: cube.size ?? 1, depth: cube.size ?? 1 }), ...(cube.cull === undefined ? {} : { cull: cube.cull }) });
                cube.more?.();
            }, { name: cube.name })();
        }
        return createScene();
    });
    const named = (name: string) => root.children.find((child) => child.name === name)!;
    return { root, named };
};

const FORWARD: TRay = { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } };
const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
const p6 = (p: { x: number; y: number; z: number }) => [r6(p.x), r6(p.y), r6(p.z)];

describe('castRay', () => {
    it('meets the front of a model, where and how far, facing back along the ray', () => {
        const { root, named } = sceneOf([{ name: 'Crate', at: { z: -5 } }]);
        const hits = castRay(FORWARD, root);
        expect(hits).toHaveLength(1);
        const [hit] = hits;
        expect(hit!.box).toBe(named('Crate') as never);
        expect(r6(hit!.distance)).toBe(4.5);
        expect(p6(hit!.point)).toEqual([0, 0, -4.5]);
        expect(p6(hit!.normal)).toEqual([0, 0, 1]);
        expect(hit!.instance).toBeNull();
        expect(hit!.mesh.type).toBe('mesh');
    });

    it('lists everything it meets nearest first, and meets the side a material keeps', () => {
        const { root, named } = sceneOf([
            { name: 'Far', at: { z: -9 } },
            { name: 'Near', at: { z: -3 } },
            { name: 'Glass', at: { z: -6 }, cull: 'none' },
            { name: 'Inside', at: { z: -12 }, cull: 'front' },
        ]);
        const hits = castRay(FORWARD, root);
        expect(hits.map((hit) => [hit.box.name, r6(hit.distance)])).toEqual([
            ['Near', 2.5],
            ['Glass', 5.5],
            ['Glass', 6.5],
            ['Far', 8.5],
            ['Inside', 12.5],
        ]);
        // Each facing back towards where the ray came from, whichever side it met.
        for (const hit of hits) expect(p6(hit.normal)).toEqual([0, 0, 1]);
        expect(named('Near')).toBeDefined();
    });

    it('meets a model turned, stretched and inside a turned box, where it is drawn', () => {
        const { root } = sceneOf([{
            name: 'Turned',
            at: { z: -5, rotationY: Math.PI / 4 },
            more: () => {
                useSpawn(function Child() {
                    useTransform({ x: 0, scaleX: 3 });
                })();
            },
        }]);
        // A cube turned an eighth about y: its front corner points at the ray, √½ nearer.
        const [hit] = castRay(FORWARD, root);
        expect(r6(hit!.distance)).toBe(r6(5 - Math.SQRT1_2));
        expect(p6(hit!.normal)).toEqual([r6(Math.SQRT1_2), 0, r6(Math.SQRT1_2)].map((n) => n === r6(Math.SQRT1_2) ? n : n));

        // Stretched three times across, and turned a quarter: its long side faces the ray.
        const stretched = sceneOf([{ name: 'Long', at: { x: 1, z: -5, scaleX: 3, rotationY: Math.PI / 2 } }]);
        const [side] = castRay({ origin: { x: 1, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } }, stretched.root);
        expect(r6(side!.distance)).toBe(3.5);
        expect(p6(side!.normal)).toEqual([0, 0, 1]);
    });

    it('meets a mirrored model as it is drawn, its faces turned inside out', () => {
        // A scale of -1 turns every triangle round on the screen, and the card keeps the same side:
        // what is seen, and met, is the far wall from inside.
        const { root } = sceneOf([{ name: 'Mirror', at: { z: -5, scaleX: -1 } }]);
        const [hit] = castRay(FORWARD, root);
        expect(r6(hit!.distance)).toBe(5.5);
        expect(p6(hit!.normal)).toEqual([0, 0, 1]);
    });

    it('does not meet what is hidden, gone or pinned to the screen', () => {
        const { root, named } = sceneOf([
            { name: 'Hidden', at: { z: -3 } },
            { name: 'Gone', at: { z: -4 } },
            { name: 'Hud', at: { z: -5 }, more: () => useScreenSpace() },
            { name: 'Shown', at: { z: -9 } },
        ]);
        named('Hidden').visible = false;
        destroy(named('Gone'));
        const hits = castRay(FORWARD, root);
        expect(hits.map((hit) => hit.box.name)).toEqual(['Shown']);
        const mesh = named('Shown').drawables[0] as { visible?: boolean };
        mesh.visible = false;
        expect(castRay(FORWARD, root)).toEqual([]);
    });

    it('meets what is squashed flat, read as the renderer reads it, and each object given once', () => {
        // A scale of 0 still draws a flat square.
        const flat = sceneOf([{ name: 'Flat', at: { z: -5, scaleZ: 0 } }]);
        const [hit] = castRay(FORWARD, flat.root);
        expect(r6(hit!.distance)).toBe(5);
        expect(p6(hit!.normal)).toEqual([0, 0, 1]);
        expect(castRay(FORWARD, flat.root)).toHaveLength(1);

        // Flattened by a 0 under turns, which leave a crumb of rounding instead of 0: still met,
        // from either side, wherever it is aimed at.
        const parent = { rotation: -2.6, rotationX: -2.2, rotationY: -2.4, scaleX: 0, scaleY: 0.6, scaleZ: 1 };
        const { store } = createTestGame();
        const squashed = startTestScene(store, 'Level', () => {
            useSpawn(function Squashed() {
                useTransform(parent);
                useSpawn(function Cube() {
                    useTransform({ rotation: 0.28, rotationX: -1.9, rotationY: -1.3 });
                    createMesh({ geometry: useCubeGeometry() });
                })();
            })();
            return createScene();
        });
        // The way the flattened square faces: the squashed box's own x, turned.
        const turn = computeModelMatrix({ x: 0, y: 0, z: 0, ...parent, scaleX: 1 } as TTransform3d);
        const facing = [turn[0]!, turn[1]!, turn[2]!];
        let seed = 5;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
        for (let i = 0; i < 100; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const d = facing.map((v) => -v * side * 1.5 + rnd() * 0.5);
            const hits = castRay({ origin: { x: -d[0]! * 5, y: -d[1]! * 5, z: -d[2]! * 5 }, direction: { x: d[0]!, y: d[1]!, z: d[2]! } }, squashed);
            expect(hits.length).toBeGreaterThan(0);
            for (const hit of hits) expect(Math.abs(Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z) - 1)).toBeLessThan(1e-9);
        }

        // A side the renderer does not know is the back, as it draws it.
        const odd = sceneOf([{ name: 'Odd', at: { z: -5 } }]);
        (odd.named('Odd').drawables[0] as unknown as { material: { cull: string } }).material.cull = 'BACK';
        expect(castRay(FORWARD, odd.root)).toHaveLength(1);

        // Given inside another that is given, or twice, it is looked in once.
        const both = sceneOf([{ name: 'Crate', at: { z: -5 } }]);
        expect(castRay(FORWARD, [both.root, both.named('Crate'), both.named('Crate')])).toHaveLength(1);
    });

    it('meets inside a picture drawn in the game only from the picture\'s own box', () => {
        const { store } = createTestGame();
        const scene = startTestScene(store, 'Level', () => {
            createSpriteTexture({ width: 8, height: 8 }, function Screen() {
                useSpawn(function Cube() {
                    useTransform({ z: -5 });
                    createMesh({ geometry: useCubeGeometry() });
                })();
            });
            return createScene();
        });
        const picture = scene.children.find((child) => child.spriteTexture !== null)!;
        expect(castRay(FORWARD, scene)).toEqual([]);
        expect(castRay(FORWARD, picture)).toHaveLength(1);
        // Given with the scene it is in, it is still looked in: the scene's walk stops at it.
        expect(castRay(FORWARD, [scene, picture])).toHaveLength(1);
        expect(castRay(FORWARD, [picture, scene])).toHaveLength(1);
    });

    it('meets each instance where it is, and says which', () => {
        const { store } = createTestGame();
        let group: ReturnType<typeof createMeshInstances> | null = null;
        const root = startTestScene(store, 'Level', () => {
            group = createMeshInstances({ geometry: useCubeGeometry(), capacity: 4, transform: { z: -5 } } as never);
            group.set(0, { x: -3 });
            group.set(1, { x: 0, z: 2 });
            group.set(2, { x: 3 });
            return createScene();
        });
        const [hit] = castRay(FORWARD, root);
        expect(hit!.instance).toBe(1);
        expect(r6(hit!.distance)).toBe(2.5);
        expect(castRay({ origin: { x: 3, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } }, root)[0]!.instance).toBe(2);
        // As many as are drawn: a count with a fraction is the whole number below it.
        group!.count = 2.5;
        expect(castRay({ origin: { x: 3, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } }, root)).toEqual([]);
        group!.count = 3;
        expect(castRay({ origin: { x: 3, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } }, root)).toHaveLength(1);
        // One not drawn is not met.
        group!.count = 1;
        expect(castRay({ origin: { x: 3, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } }, root)).toEqual([]);
    });

    it('looks only in what it is given, placed by everything above it, and no further than it is told', () => {
        const { store } = createTestGame();
        let inner: TBox | null = null;
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Shelf() {
                useTransform({ z: -5 });
                inner = useSpawn(function Jar() {
                    useTransform({ x: 2 });
                    createMesh({ geometry: useCubeGeometry() });
                })();
            })();
            useSpawn(function Wall() {
                useTransform({ z: -20 });
                createMesh({ geometry: useCubeGeometry({ width: 40, height: 40 }) });
            })();
            return createScene();
        });
        const ray: TRay = { origin: { x: 2, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } };
        expect(castRay(ray, root).map((hit) => hit.box.name)).toEqual(['Jar', 'Wall']);
        // The jar alone, where its shelf puts it.
        const [jar] = castRay(ray, inner!);
        expect(r6(jar!.distance)).toBe(4.5);
        expect(castRay(ray, [inner!])).toHaveLength(1);
        // Cut short.
        expect(castRay(ray, root, { maxDistance: 10 }).map((hit) => hit.box.name)).toEqual(['Jar']);
        expect(castRay(ray, root, { maxDistance: 4 })).toEqual([]);
        // Within reach of its box, but not of its far side.
        const glass = sceneOf([{ name: 'Glass', at: { z: -3 }, cull: 'none' }]);
        expect(castRay(FORWARD, glass.root, { maxDistance: 3 }).map((hit) => r6(hit.distance))).toEqual([2.5]);
        // Nothing behind where it starts.
        expect(castRay({ origin: { x: 2, y: 0, z: -30 }, direction: { x: 0, y: 0, z: -1 } }, root)).toEqual([]);
        // A direction of any length: distances are still the world's.
        expect(r6(castRay({ ...ray, direction: { x: 0, y: 0, z: -7 } }, inner!)[0]!.distance)).toBe(4.5);
    });

    it('meets what is under a point of the screen, with screenToRay', () => {
        const { store } = createTestGame();
        let camera: ReturnType<typeof useCamera3d> | null = null;
        let scene: TBox | null = null;
        startTestScene(store, 'Level', () => {
            camera = useCamera3d({ projection: 'perspective', fov: 60, transform: { z: 6 } });
            scene = useSelf();
            useSpawn(function Left() {
                useTransform({ x: -2 });
                createMesh({ geometry: useCubeGeometry() });
            })();
            useSpawn(function Middle() {
                useTransform({});
                createMesh({ geometry: useCubeGeometry() });
            })();
            return createScene();
        });
        const [width, height] = [480, 320];
        const middle = castRay(screenToRay(camera!, width, height, width / 2, height / 2), scene!)[0];
        expect(middle!.box.name).toBe('Middle');
        expect(r6(middle!.point.z)).toBe(0.5);
        // Far to the right there is nothing.
        expect(castRay(screenToRay(camera!, width, height, width - 1, height / 2), scene!)).toEqual([]);
    });

    it('agrees with every triangle tried in the world, however the model is placed', () => {
        // The oracle: each triangle carried into the world by the renderer's own matrix and met
        // there, the side kept being the one that goes round against the clock as the ray sees it.
        let seed = 11;
        let met = 0;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const spread = (k: number) => (rnd() - 0.5) * 2 * k;
        for (let trial = 0; trial < 120; trial++) {
            const at: TPlace = {
                x: spread(0.3), y: spread(0.3), z: -4 + spread(1),
                rotationX: spread(3), rotationY: spread(3), rotation: spread(3),
                scaleX: (rnd() < 0.2 ? -1 : 1) * (0.3 + rnd() * 2), scaleY: 0.3 + rnd() * 2, scaleZ: (rnd() < 0.2 ? -1 : 1) * (0.3 + rnd() * 2),
            };
            const cull = (['back', 'front', 'none'] as const)[Math.floor(rnd() * 3)]!;
            const { root, named } = sceneOf([{ name: 'Piece', at, cull }]);
            const ray: TRay = { origin: { x: spread(0.3), y: spread(0.3), z: 2 }, direction: { x: spread(0.05), y: spread(0.05), z: -1 } };
            const length = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z);
            const d = [ray.direction.x / length, ray.direction.y / length, ray.direction.z / length];
            const o = [ray.origin.x, ray.origin.y, ray.origin.z];

            const box = named('Piece');
            const mesh = box.drawables[0] as unknown as { transform: TTransform3d; geometry: { positions: Float32Array; indices: Uint16Array } };
            const m = computeModelMatrix({ ...(box.transform as TTransform3d) });
            const local = computeModelMatrix(mesh.transform);
            const world = (i: number) => {
                const p = [mesh.geometry.positions[i * 3]!, mesh.geometry.positions[i * 3 + 1]!, mesh.geometry.positions[i * 3 + 2]!];
                const q = [0, 1, 2].map((r) => local[r]! * p[0]! + local[4 + r]! * p[1]! + local[8 + r]! * p[2]! + local[12 + r]!);
                return [0, 1, 2].map((r) => m[r]! * q[0]! + m[4 + r]! * q[1]! + m[8 + r]! * q[2]! + m[12 + r]!);
            };
            const expected: number[] = [];
            const idx = mesh.geometry.indices;
            for (let t = 0; t < idx.length; t += 3) {
                const [a, b, c] = [world(idx[t]!), world(idx[t + 1]!), world(idx[t + 2]!)];
                const e1 = [0, 1, 2].map((k) => b[k]! - a[k]!);
                const e2 = [0, 1, 2].map((k) => c[k]! - a[k]!);
                const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
                const facing = n[0]! * d[0]! + n[1]! * d[1]! + n[2]! * d[2]!;
                if (facing === 0 || (cull === 'back' && facing > 0) || (cull === 'front' && facing < 0)) continue;
                const t0 = (n[0]! * (a[0]! - o[0]!) + n[1]! * (a[1]! - o[1]!) + n[2]! * (a[2]! - o[2]!)) / facing;
                if (t0 < 0) continue;
                const p = [0, 1, 2].map((k) => o[k]! + d[k]! * t0);
                const inside = [[a, b], [b, c], [c, a]].every(([u, v]) => {
                    const edge = [0, 1, 2].map((k) => v![k]! - u![k]!);
                    const to = [0, 1, 2].map((k) => p[k]! - u![k]!);
                    const cr = [edge[1]! * to[2]! - edge[2]! * to[1]!, edge[2]! * to[0]! - edge[0]! * to[2]!, edge[0]! * to[1]! - edge[1]! * to[0]!];
                    return cr[0]! * n[0]! + cr[1]! * n[1]! + cr[2]! * n[2]! >= -1e-9;
                });
                if (inside) expected.push(t0);
            }
            expected.sort((x, y) => x - y);
            const got = castRay(ray, root).map((hit) => hit.distance);
            // Two triangles sharing an edge met at one place are one surface met once.
            const merged = expected.filter((t, i) => i === 0 || Math.abs(t - expected[i - 1]!) > 1e-6);
            expect(got.map((t) => t.toFixed(4))).toEqual(merged.map((t) => t.toFixed(4)));
            if (got.length > 0) met++;
        }
        // Most of the rays are aimed to meet the piece.
        expect(met).toBeGreaterThan(80);
    });

    it('says what is wrong with what it is asked', () => {
        const { root } = sceneOf([]);
        expect(() => castRay({ origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } }, root)).toThrow("castRay: the ray's direction is (0, 0, 0)");
        expect(() => castRay({ origin: { x: Number.NaN, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 } }, root)).toThrow('castRay: the ray takes an origin and a direction');
        expect(() => castRay(FORWARD, root, { maxDistance: 0 })).toThrow('maxDistance is 0');
    });
});

describe('rayOnPlane', () => {
    it('meets the floor by default, from above or below, and says how far', () => {
        const down = rayOnPlane({ origin: { x: 1, y: 4, z: 2 }, direction: { x: 0, y: -1, z: 0 } });
        expect(down).toEqual({ point: { x: 1, y: 0, z: 2 }, distance: 4 });
        const up = rayOnPlane({ origin: { x: 0, y: -2, z: 0 }, direction: { x: 0, y: 1, z: 0 } });
        expect(up!.distance).toBe(2);
        // Slanting, and with a direction of any length.
        const slant = rayOnPlane({ origin: { x: 0, y: 3, z: 0 }, direction: { x: 0, y: -6, z: -6 } });
        expect(p6(slant!.point)).toEqual([0, 0, -3]);
        expect(r6(slant!.distance)).toBe(r6(3 * Math.SQRT2));
    });

    it('meets a plane at another height, or a wall, and nothing alongside or behind', () => {
        const table = rayOnPlane({ origin: { x: 0, y: 5, z: 0 }, direction: { x: 0, y: -1, z: 0 } }, { point: { x: 0, y: 0.8, z: 0 } });
        expect(r6(table!.point.y)).toBe(0.8);
        const wall = rayOnPlane(FORWARD, { point: { x: 0, y: 0, z: -4 }, normal: { x: 0, y: 0, z: 2 } });
        expect(wall).toEqual({ point: { x: 0, y: 0, z: -4 }, distance: 4 });
        expect(rayOnPlane({ origin: { x: 0, y: 1, z: 0 }, direction: { x: 1, y: 0, z: 0 } })).toBeNull();
        expect(rayOnPlane({ origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 1, z: 0 } })).toBeNull();
        expect(() => rayOnPlane(FORWARD, { normal: { x: 0, y: 0, z: 0 } })).toThrow("rayOnPlane: the plane's normal is (0, 0, 0)");
    });
});
