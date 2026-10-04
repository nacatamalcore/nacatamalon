import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useCubeGeometry } from '../src/hooks/geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { fromEuler, rotateVec3 } from '../src/math/quat';
import { localPosition3dFrom, localQuaternionFrom, placement3dOf, worldPlacement3dOf } from '../src/box';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TQuat } from '../src/math/quat';

/**
 * Where an object is when the world has depth in it.
 *
 * The flat pair of these is tested next door with a physics body hanging off it. This one is worth
 * its own file because the two answers it adds are the ones a solver cannot do without and a
 * drawing never needed: **which way something faces**, and how to write a free turn back onto an
 * object whose placement is relative to whatever it hangs under.
 *
 * Every claim here is one I broke on purpose first to watch it fail.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const flat = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });

/**
 * Quaternions compare badly digit for digit, so they are compared as turns of a known vector.
 */
const close = (a: TQuat, b: TQuat, probe = { x: 0.3, y: -0.5, z: 0.8 }): void => {
    const one = rotateVec3(a, probe);
    const two = rotateVec3(b, probe);
    expect(one.x).toBeCloseTo(two.x, 6);
    expect(one.y).toBeCloseTo(two.y, 6);
    expect(one.z).toBeCloseTo(two.z, 6);
};

describe('where an object is in space', () => {
    it('is its own placement, and failing that the one its SHAPE carries', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Placed() {
                useTransform({ x: 10, y: 20, z: 30 });
            })();
            useSpawn(function Drawn() {
                createMesh({ geometry: useCubeGeometry(), transform: { x: 1, y: 2, z: 3 } });
            })();
            useSpawn(function Nothing() {})();
            return createScene();
        });

        expect(placement3dOf(root.children[0])).toMatchObject({ x: 10, y: 20, z: 30 });
        expect(placement3dOf(root.children[1])).toMatchObject({ x: 1, y: 2, z: 3 });
        expect(placement3dOf(root.children[2])).toBeNull();
    });

    it('is NOT a picture, which has no depth and no way of facing', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Flat() {
                createSprite({ width: 8, height: 8, tint, transform: flat(40, 60) });
            })();
            return createScene();
        });

        // The flat answer would be 40, 60 at depth nothing, facing forward, which is an answer to a
        // different question. Here it is honestly nowhere.
        expect(placement3dOf(root.children[0])).toBeNull();
    });

    it('is composed through the objects above it: moved, turned, and grown', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Room() {
                // A quarter turn about Y: the room's +x now points along -z.
                useTransform({ x: 100, y: 0, z: 0, rotationY: Math.PI / 2, scaleX: 2, scaleY: 2, scaleZ: 2 });
                useSpawn(function Crate() {
                    useTransform({ x: 5, y: 1, z: 0 });
                })();
            })();
            return createScene();
        });
        const crate = root.children[0].children[0];
        const pose = worldPlacement3dOf(crate);

        // 5 along the room's x, doubled, turned a quarter: ten units towards -z, and up by two.
        expect(pose.position.x).toBeCloseTo(100, 6);
        expect(pose.position.y).toBeCloseTo(2, 6);
        expect(pose.position.z).toBeCloseTo(-10, 6);
        expect(pose.scale).toMatchObject({ x: 2, y: 2, z: 2 });
        close(pose.quaternion, fromEuler(0, Math.PI / 2, 0));
    });

    it('comes back, which is the half that makes a solver answer writable', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Room() {
                useTransform({ x: 100, y: 0, z: 0, rotationY: Math.PI / 2, scaleX: 2, scaleY: 2, scaleZ: 2 });
                useSpawn(function Crate() {
                    useTransform({ x: 5, y: 1, z: 0 });
                })();
            })();
            return createScene();
        });
        const crate = root.children[0].children[0];

        const local = localPosition3dFrom(crate, { x: 100, y: 2, z: -10 });
        expect(local.x).toBeCloseTo(5, 6);
        expect(local.y).toBeCloseTo(1, 6);
        expect(local.z).toBeCloseTo(0, 6);

        // A body that ended up facing the way the room faces was never turned inside it.
        close(localQuaternionFrom(crate, fromEuler(0, Math.PI / 2, 0)), fromEuler(0, 0, 0));
    });

    it('does not let what an object DRAWS move the things under it', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            // A sign hung on the room itself, thirty units away from the room's own origin.
            createMesh({ geometry: useCubeGeometry(), transform: { x: 30, y: 0, z: 0 } });
            useSpawn(function Crate() {
                useTransform({ x: 5, y: 0, z: 0 });
            })();
            return createScene();
        });
        const crate = root.children[0];

        // Not 35: the sign says where the sign is, and nothing about the room it hangs in.
        expect(worldPlacement3dOf(crate).position.x).toBeCloseTo(5, 6);
    });

    it('reads a turn written as a whole, and ignores the three angles under it', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Ship() {
                useTransform({ rotationX: 1, rotationY: 2, rotation: 3, quaternion: fromEuler(0, Math.PI / 4, 0) });
            })();
            return createScene();
        });

        close(worldPlacement3dOf(root.children[0]).quaternion, fromEuler(0, Math.PI / 4, 0));
    });

    it('reads the three angles in the order the renderer reads them', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Ramp() {
                useTransform({ rotationX: 0.2, rotationY: 0.5, rotation: 0.32 });
            })();
            return createScene();
        });

        // Y, then X, then Z. Any other order is a ramp that leans the wrong way, which is the kind
        // of wrong that looks deliberate.
        close(worldPlacement3dOf(root.children[0]).quaternion, fromEuler(0.2, 0.5, 0.32));
    });
});
