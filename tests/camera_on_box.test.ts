import { describe, expect, it } from 'bun:test';
import { cameraOnBox } from '../src/camera/camera_on_box';
import { createScene } from '../src/scene/create_scene';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { fromEuler, multiply, rotateVec3 } from '../src/math/quat';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TCamera3d } from '../src/camera/types/t_camera_3d';

/** Where a placement's angles look, and which way is up for it, read the way the renderer reads them. */
const axesOf = (t: { rotationX: number; rotationY: number; rotation: number }) => {
    const turn = fromEuler(t.rotationX, t.rotationY, t.rotation);
    return { ahead: rotateVec3(turn, { x: 0, y: 0, z: -1 }), up: rotateVec3(turn, { x: 0, y: 1, z: 0 }) };
};

describe('a picture\'s camera on its box', () => {
    const turns: Array<[number, number, number]> = [
        [0, 0, 0], [0.3, -1.2, 0.5], [-1.1, 2.7, -0.2], [1.4, 0.2, 3], [-0.6, -3, 1.1], [Math.PI / 2, 0.7, 0],
    ];

    it('looks where the box turns it, and stands the way it does, for any turn of either', () => {
        for (const box of turns) {
            for (const own of turns) {
                const { store } = createTestGame();
                let camera!: TCamera3d;
                let holder!: TBox;
                startTestScene(store, 'S', () => {
                    createSpriteTexture({ width: 4, height: 4, sees: '3d' }, () => {
                        useTransform({ x: 1, y: 2, z: 3, rotationX: box[0], rotationY: box[1], rotation: box[2] });
                        camera = useCamera3d({ projection: 'perspective', transform: { x: 0.5, rotationX: own[0], rotationY: own[1], rotation: own[2] } });
                    });
                    return createScene();
                });
                holder = store.get('world').scenes[0]!.children.find((child) => child.spriteTexture !== null)!;

                const placed = cameraOnBox(camera, holder, '3d');
                const whole = multiply(fromEuler(...box), fromEuler(...own));
                const want = { ahead: rotateVec3(whole, { x: 0, y: 0, z: -1 }), up: rotateVec3(whole, { x: 0, y: 1, z: 0 }) };
                const got = axesOf(placed.transform);
                for (const axis of ['ahead', 'up'] as const) {
                    expect(got[axis].x).toBeCloseTo(want[axis].x, 4);
                    expect(got[axis].y).toBeCloseTo(want[axis].y, 4);
                    expect(got[axis].z).toBeCloseTo(want[axis].z, 4);
                }
                // Half a unit along the box's own x, from where the box is.
                const side = rotateVec3(fromEuler(...box), { x: 0.5, y: 0, z: 0 });
                expect(placed.transform.x).toBeCloseTo(1 + side.x, 4);
                expect(placed.transform.y).toBeCloseTo(2 + side.y, 4);
                expect(placed.transform.z).toBeCloseTo(3 + side.z, 4);
            }
        }
    });

    it('is placed through the size of a box that stands at the origin, as anywhere else', () => {
        const { store } = createTestGame();
        let camera!: TCamera3d;
        startTestScene(store, 'S', () => {
            createSpriteTexture({ width: 4, height: 4, sees: '3d' }, () => {
                useTransform({ scaleX: 2, scaleY: 2, scaleZ: 2 });
                camera = useCamera3d({ projection: 'perspective', transform: { z: 3 } });
            });
            return createScene();
        });
        const holder = store.get('world').scenes[0]!.children.find((child) => child.spriteTexture !== null)!;
        const placed = cameraOnBox(camera, holder, '3d');
        expect(placed).not.toBe(camera);
        expect(placed.transform.z).toBeCloseTo(6, 5);
    });

    it('inside another picture, is placed in that picture\'s world, which starts at its object', () => {
        const { store } = createTestGame();
        let camera!: TCamera3d;
        let inner!: TBox;
        startTestScene(store, 'S', () => {
            useSpawn(() => {
                // What holds the outer picture is not in its world.
                useTransform({ x: 100 });
                createSpriteTexture({ width: 4, height: 4 }, () => {
                    useTransform({ x: 10 });
                    createSpriteTexture({ width: 4, height: 4, sees: '3d' }, () => {
                        useTransform({ x: 1 });
                        camera = useCamera3d({ projection: 'perspective' });
                    });
                });
            })();
            return createScene();
        });
        const find = (box: TBox): TBox | null => box.camera3d === camera ? box : box.children.map(find).find((b) => b !== null) ?? null;
        inner = find(store.get('world').scenes[0]!)!;
        expect(cameraOnBox(camera, inner, '3d').transform.x).toBeCloseTo(11, 5);
        // A view of the whole world films it from the top, holder and all.
        expect(cameraOnBox(camera, inner, 'world').transform.x).toBeCloseTo(111, 5);
    });

    it('is the camera itself, untouched, on a box at the world\'s origin', () => {
        const { store } = createTestGame();
        let camera!: TCamera3d;
        startTestScene(store, 'S', () => {
            useSpawn(() => {
                createSpriteTexture({ width: 4, height: 4, sees: '3d' }, () => {
                    camera = useCamera3d({ projection: 'perspective', transform: { y: 3 } });
                });
            })();
            return createScene();
        });
        const holder = store.get('world').scenes[0]!.children[0]!.children[0]!;
        expect(cameraOnBox(camera, holder, '3d')).toBe(camera);
    });
});
