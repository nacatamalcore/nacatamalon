import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh';
import { useCubeGeometry } from '../src/hooks/geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { computeModelMatrix } from '../src/render/shared/compute_mvp_3d';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { worldPlacement3dOf } from '../src/box';
import { worldPoseOf, writeWorldPose } from '../src/physics/box3d/world_pose';
import { fromEuler } from '../src/math/quat';
import { parseSceneDoc, serializeScene } from '../src/scene/document';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { Mat4 } from '../src/math/mat4';
import type { TFrameContext } from '../src/render';
import type { TMesh } from '../src/gameobjects/mesh';
import type { TRuntimeStore } from '../src/store';
import type { TTransform3d } from '../src/gameobjects/types/t_transform_3d';

/**
 * A pivot in three dimensions: the point a placement turns and grows about, in its own units, the
 * way a sprite's pivot is in the plane. A model that stumbles over its feet, a door on its hinge.
 */

const place = (over: Partial<TTransform3d>): TTransform3d => ({
    x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, ...over,
});

/** Where a point of the thing ends up, through its matrix. */
const apply = (m: Mat4, p: { x: number; y: number; z: number }) => ({
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
});

const near = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): void => {
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
    expect(a.z).toBeCloseTo(b.z, 6);
};

const frame = (store: TRuntimeStore) => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
};

const FEET = { x: 0, y: -1, z: 0 };

describe('a pivot in three dimensions', () => {
    it('moves nothing while it is neither turned nor grown', () => {
        const plain = computeModelMatrix(place({ x: 3, y: 4, z: 5 }));
        const pivoted = computeModelMatrix(place({ x: 3, y: 4, z: 5, pivot: FEET }));
        expect([...pivoted].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([...plain].map((v) => Math.round(v * 1e9) / 1e9));
    });

    it('turns it about the pivot, which stays where it is', () => {
        // A quarter turn forward over its feet: the feet stay put, its middle goes down to their
        // height, a step ahead of them.
        const m = computeModelMatrix(place({ x: 10, y: 2, z: 0, rotationX: -Math.PI / 2, pivot: FEET }));
        near(apply(m, FEET), { x: 10, y: 1, z: 0 });
        near(apply(m, { x: 0, y: 0, z: 0 }), { x: 10, y: 1, z: -1 });
        // Without it, the same turn goes about the middle, and the feet swing.
        const about = computeModelMatrix(place({ x: 10, y: 2, z: 0, rotationX: -Math.PI / 2 }));
        near(apply(about, { x: 0, y: 0, z: 0 }), { x: 10, y: 2, z: 0 });
    });

    it('grows it about the pivot too, and goes with a turn written as a quaternion', () => {
        const grown = computeModelMatrix(place({ scaleX: 2, scaleY: 2, scaleZ: 2, pivot: FEET }));
        near(apply(grown, FEET), FEET);
        near(apply(grown, { x: 0, y: 0, z: 0 }), { x: 0, y: 1, z: 0 });

        const turned = computeModelMatrix(place({ quaternion: fromEuler(-Math.PI / 2, 0, 0), pivot: FEET }));
        near(apply(turned, FEET), FEET);
    });

    it('turns what the box holds about it: a model inside a box turned over its feet', () => {
        const { store } = createTestGame();
        let mesh!: TMesh;
        startTestScene(store, 'Level', () => {
            useSpawn(function Runner() {
                useTransform({ x: 10, y: 2, z: 0, rotationX: -Math.PI / 2, pivot: FEET });
                mesh = createMesh({ geometry: useCubeGeometry() });
            })();
            return createScene();
        });

        frame(store);
        near(apply(mesh.worldMatrix!, FEET), { x: 10, y: 1, z: 0 });
        near(apply(mesh.worldMatrix!, { x: 0, y: 0, z: 0 }), { x: 10, y: 1, z: -1 });
    });

    it('is where the rest of the engine finds it as well: the drawing and the pose agree', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Room() {
                useTransform({ x: 100, rotationY: Math.PI / 2 });
                useSpawn(function Door() {
                    useTransform({ x: 5, y: 1, z: 2, rotationY: 0.7, scaleX: 2, pivot: { x: -1, y: 0, z: 0 } });
                })();
            })();
            return createScene();
        });
        const room = root.children[0]!;
        const door = room.children[0]!;

        const drawn = apply(
            computeModelMatrix(room.transform!),
            apply(computeModelMatrix(door.transform!), { x: 0, y: 0, z: 0 }),
        );
        near(worldPlacement3dOf(door).position, drawn);
    });

    it('is undone when a simulated pose is written back, so the body does not drift', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Crate() {
                useTransform({ x: 3, y: 4, z: 5, rotationX: 0.4, pivot: FEET });
            })();
            return createScene();
        });
        const crate = root.children[0]!;
        const before = worldPoseOf(crate);

        // Told where it is and turned further, then asked again: it is there.
        const turned = fromEuler(1.1, 0.3, 0);
        writeWorldPose(crate, before.position, turned);
        near(worldPoseOf(crate).position, before.position);
        writeWorldPose(crate, { x: 7, y: 8, z: 9 }, turned);
        near(worldPoseOf(crate).position, { x: 7, y: 8, z: 9 });
    });

    it('is written down only when set, and read back the same', () => {
        const written = (pivot: TTransform3d['pivot']) => {
            const { store } = createTestGame();
            const root = startTestScene(store, 'Level', () => {
                useSpawn(function Runner() {
                    useTransform({ x: 4, ...(pivot !== undefined ? { pivot } : {}) });
                })();
                return createScene();
            });
            return serializeScene(root);
        };

        expect(written(undefined).root.children[0]!.transform).not.toHaveProperty('pivot');
        const on = written(FEET);
        expect(on.root.children[0]!.transform!.pivot).toEqual(FEET);
        expect(parseSceneDoc(on, '/scenes/level.scene')).toEqual(on);
    });
});
