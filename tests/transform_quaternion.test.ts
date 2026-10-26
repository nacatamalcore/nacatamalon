import { describe, expect, it } from 'bun:test';
import * as quat from '../src/math/quat';
import { computeModelMatrix, normalMatrixOf, rotationMatrix } from '../src/render/shared/compute_mvp_3d';
import { createMesh } from '../src/gameobjects/mesh';
import { createScene } from '../src/scene/create_scene';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { useCubeGeometry } from '../src/hooks/geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext } from '../src/render';
import type { TTransform3d } from '../src/gameobjects/types/t_transform_3d';

/**
 * Saying which way something is turned with a quaternion instead of three angles.
 *
 * The thing worth pinning down is that the two are the same answer when they say the same thing:
 * anything authored with angles has to be able to switch without moving.
 */

const at = (extra: Partial<TTransform3d> = {}): TTransform3d =>
    ({ x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, ...extra });

/**
 * Where a direction ends up under a placement.
 */
const turn = (m: Float32Array, x: number, y: number, z: number): [number, number, number] => [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
];

const close = (got: [number, number, number], want: [number, number, number]): void => {
    expect(got[0]).toBeCloseTo(want[0]);
    expect(got[1]).toBeCloseTo(want[1]);
    expect(got[2]).toBeCloseTo(want[2]);
};

describe('a turn written as a quaternion', () => {
    it('changes nothing at all when there is none', () => {
        const angles = at({ rotationY: 0.7, rotationX: 0.2, rotation: -0.4 });
        const before = Array.from(rotationMatrix(angles));

        expect(Array.from(rotationMatrix({ ...angles, quaternion: null }))).toEqual(before);
        expect(Array.from(rotationMatrix({ ...angles, quaternion: undefined }))).toEqual(before);
    });

    it('lands exactly where the three angles did, which is what lets one be swapped for the other', () => {
        const angles = at({ rotationY: 0.7, rotationX: 0.2, rotation: -0.4 });
        const same = at({ quaternion: quat.fromEuler(0.2, 0.7, -0.4) });

        const fromAngles = Array.from(rotationMatrix(angles));
        const fromQuat = Array.from(rotationMatrix(same));
        for (let i = 0; i < 16; i++) {
            expect(fromQuat[i]).toBeCloseTo(fromAngles[i]);
        }
    });

    it('decides the turn on its own: the three angles beside it are not read', () => {
        const only = at({ quaternion: quat.identity(), rotationY: 1.1, rotationX: 0.9, rotation: 0.5 });

        expect(Array.from(rotationMatrix(only))).toEqual(Array.from(rotationMatrix(at())));
    });

    it('turns a quarter about x, so what faced the viewer ends up facing up', () => {
        const quarter = at({ quaternion: quat.fromAxisAngle(1, 0, 0, Math.PI / 2) });

        close(turn(rotationMatrix(quarter), 0, 0, 1), [0, -1, 0]);
    });

    it('still moves and grows as it always did', () => {
        const placed = at({ x: 3, y: -2, z: 5, scaleX: 2, scaleY: 2, scaleZ: 2, quaternion: quat.identity() });
        const model = computeModelMatrix(placed);

        expect([model[12], model[13], model[14]]).toEqual([3, -2, 5]);
        expect(model[0]).toBeCloseTo(2);
    });

    it('carries the facings of its surfaces round with it', () => {
        const placed = at({ x: 10, quaternion: quat.fromAxisAngle(0, 1, 0, Math.PI / 2), scaleX: 3, scaleY: 3, scaleZ: 3 });
        const normals = normalMatrixOf(computeModelMatrix(placed));

        // The move is dropped and the size taken back out, so only the turn is left.
        close(turn(normals, 0, 0, 1), [1, 0, 0]);
        expect([normals[12], normals[13], normals[14]]).toEqual([0, 0, 0]);
    });

    it('eases from one facing to another without passing through anywhere silly', () => {
        const from = quat.fromAxisAngle(0, 1, 0, 0);
        const to = quat.fromAxisAngle(0, 1, 0, Math.PI / 2);
        const half = quat.slerp(from, to, 0.5);

        close(turn(rotationMatrix(at({ quaternion: half })), 0, 0, 1), [Math.SQRT1_2, 0, Math.SQRT1_2]);
    });

    it('turns by the whole angle about an axis of any length, which only showed at large angles', () => {
        const short = quat.fromAxisAngle(0, 0, 0.669, (42 * Math.PI) / 180);
        expect(Math.hypot(...short)).toBeCloseTo(1, 6);
        const tilted = quat.rotateVec3(short, { x: 1, y: 0, z: 0 });
        expect((Math.atan2(tilted.y, tilted.x) * 180) / Math.PI).toBeCloseTo(42, 4);

        expect(quat.fromAxisAngle(0, 5, 0, 1)).toEqual(quat.fromAxisAngle(0, 1, 0, 1));
        expect(quat.fromAxisAngle(0, 0, 0, 1)).toEqual([0, 0, 0, 1]);
    });
});

describe('a box turned by a quaternion', () => {
    /**
     * Where the one model in the scene ends up, as the renderer would be handed it.
     */
    const worldOf = (turn: Partial<TTransform3d>): Float32Array => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            const spawn = useSpawn(() => {
                useTransform({ x: 2, ...turn });
                createMesh({ geometry: useCubeGeometry(), transform: { z: 4 } });
            });
            spawn();
            return createScene();
        });

        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        const mesh = (ctx.passes[0].drawables ?? []).find((item) => item.type === 'mesh');
        return (mesh as unknown as { worldMatrix: Float32Array }).worldMatrix;
    };

    it('places a model inside it the same way the three angles would have', () => {
        const byAngles = worldOf({ rotationY: Math.PI / 2 });
        const byQuat = worldOf({ quaternion: quat.fromAxisAngle(0, 1, 0, Math.PI / 2) });

        for (let i = 0; i < 16; i++) {
            expect(byQuat[i]).toBeCloseTo(byAngles[i]);
        }
        // A quarter turn about y carries something four in front of it round to four to its right,
        // on top of the two the box itself is out by.
        expect(byQuat[12]).toBeCloseTo(6);
        expect(byQuat[14]).toBeCloseTo(0);
    });
});

describe('where a model in the scene itself ends up', () => {
    it('is written for a model no box moves, as for one inside a box that does', () => {
        const { store } = createTestGame();
        let mesh: ReturnType<typeof createMesh> | null = null;
        startTestScene(store, 'Level', () => {
            mesh = createMesh({ geometry: useCubeGeometry(), transform: { x: 3, z: -2, quaternion: quat.fromAxisAngle(0, 1, 0, Math.PI / 2) } });
            return createScene();
        });

        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        const world = mesh!.worldMatrix;
        expect(world).toBeDefined();
        const own = computeModelMatrix(mesh!.transform);
        for (let i = 0; i < 16; i++) {
            expect(world![i]).toBeCloseTo(own[i]);
        }

        // Kept up with as it moves, in the same matrix.
        mesh!.transform.x = 7;
        fillFrameContext(store, ctx);
        expect(mesh!.worldMatrix).toBe(world);
        expect(world![12]).toBeCloseTo(7);
    });
});
