import { describe, expect, it } from 'bun:test';
import { cameraLookAt, createCamera3d, screenToRay, worldToScreen } from '../src/camera';
import { findObject, findObjects } from '../src/box';
import { createScene } from '../src/scene/create_scene';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSelf } from '../src/hooks/spawn/use_self';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TCamera3d } from '../src/camera';

/**
 * Where the pointer is in the world, where the world is on the screen, and turning a camera.
 *
 * All three are checked against each other rather than against numbers worked out by hand: a ray
 * through a pixel has to pass through whatever `worldToScreen` puts on that pixel, and a camera
 * turned at something has to put it in the middle of the screen. They share the renderer's own
 * matrices, so agreeing with each other is agreeing with what is drawn.
 */

const W = 480;
const H = 320;

const perspective = (): TCamera3d =>
    createCamera3d({ projection: 'perspective', fov: 60, near: 0.1, far: 100, x: 1, y: 2, z: 8, rotationX: -0.2, rotationY: 0.3 });

const orthographic = (): TCamera3d => createCamera3d({ projection: 'orthographic', z: 50 });

/**
 * The point a ray reaches after `t` units.
 */
const along = (ray: ReturnType<typeof screenToRay>, t: number) => ({
    x: ray.origin.x + ray.direction.x * t,
    y: ray.origin.y + ray.direction.y * t,
    z: ray.origin.z + ray.direction.z * t,
});

describe('screenToRay and worldToScreen', () => {
    for (const [label, make] of [['perspective', perspective], ['orthographic', orthographic]] as const) {
        it(`agree with each other through a ${label} camera`, () => {
            const camera = make();
            for (const [px, py] of [[240, 160], [10, 20], [470, 300], [123.5, 77.25]]) {
                const ray = screenToRay(camera, W, H, px, py);
                expect(Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z)).toBeCloseTo(1, 6);
                // Every point along the ray lands on the pixel it was cast through.
                for (const t of [1, 5, 20]) {
                    const back = worldToScreen(camera, W, H, along(ray, t));
                    expect(back.behind).toBe(false);
                    expect(back.x).toBeCloseTo(px, 3);
                    expect(back.y).toBeCloseTo(py, 3);
                }
            }
        });
    }

    it('casts the middle of the screen straight along where the camera looks', () => {
        const camera = createCamera3d({ projection: 'perspective', z: 5 });
        const ray = screenToRay(camera, W, H, W / 2, H / 2);

        expect(ray.direction.x).toBeCloseTo(0, 6);
        expect(ray.direction.y).toBeCloseTo(0, 6);
        expect(ray.direction.z).toBeCloseTo(-1, 6);
        // It starts on the near plane, in front of the camera.
        expect(ray.origin.z).toBeCloseTo(5 - 0.1, 3);
    });

    it('puts the top of the screen above the camera: y grows downwards on the screen, upwards in the world', () => {
        const camera = createCamera3d({ projection: 'perspective', z: 5 });

        expect(screenToRay(camera, W, H, W / 2, 0).direction.y).toBeGreaterThan(0);
        expect(worldToScreen(camera, W, H, { x: 0, y: 1, z: 0 }).y).toBeLessThan(H / 2);
        expect(worldToScreen(camera, W, H, { x: 1, y: 0, z: 0 }).x).toBeGreaterThan(W / 2);
    });

    it('says when a point is behind the camera', () => {
        const camera = createCamera3d({ projection: 'perspective', z: 5 });

        expect(worldToScreen(camera, W, H, { x: 0, y: 0, z: 0 }).behind).toBe(false);
        expect(worldToScreen(camera, W, H, { x: 0, y: 0, z: 10 }).behind).toBe(true);
    });

    it('puts depth from 0 at the near plane to 1 at the far one', () => {
        const camera = createCamera3d({ projection: 'perspective', near: 1, far: 10, z: 0 });

        expect(worldToScreen(camera, W, H, { x: 0, y: 0, z: -1 }).depth).toBeCloseTo(0, 4);
        expect(worldToScreen(camera, W, H, { x: 0, y: 0, z: -10 }).depth).toBeCloseTo(1, 4);
    });

    it('measures an orthographic view in the game\'s pixels, as a sprite is placed', () => {
        const camera = orthographic();
        const at = worldToScreen(camera, W, H, { x: 100, y: H - 40, z: 0 });

        // X runs with the screen; y is turned over, because it points up in 3D.
        expect(at.x).toBeCloseTo(100, 3);
        expect(at.y).toBeCloseTo(40, 3);
    });
});

describe('cameraLookAt', () => {
    it('puts what it looks at in the middle of the screen, from anywhere', () => {
        for (const [from, target] of [
            [{ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }],
            [{ x: 3, y: 4, z: -2 }, { x: -1, y: 0, z: 6 }],
            [{ x: -5, y: -1, z: 0 }, { x: 2, y: 3, z: 0.5 }],
        ]) {
            const camera = createCamera3d({ projection: 'perspective', ...from });
            cameraLookAt(camera, target);

            const at = worldToScreen(camera, W, H, target);
            expect(at.behind).toBe(false);
            expect(at.x).toBeCloseTo(W / 2, 3);
            expect(at.y).toBeCloseTo(H / 2, 3);
        }
    });

    it('keeps its roll, and gives up a quaternion that would be read instead of the angles', () => {
        const camera = createCamera3d({ projection: 'perspective', rotation: 0.4, z: 5 });
        camera.transform.quaternion = [0, 0, 0, 1];
        cameraLookAt(camera, { x: 2, y: 0, z: 0 });

        expect(camera.transform.rotation).toBe(0.4);
        expect(camera.transform.quaternion).toBeNull();
    });

    it('keeps its left and right when told to look straight down', () => {
        const camera = createCamera3d({ projection: 'perspective', rotationY: 1.2, y: 5 });
        cameraLookAt(camera, { x: 0, y: 0, z: 0 });

        expect(camera.transform.rotationY).toBe(1.2);
        expect(camera.transform.rotationX).toBeCloseTo(-Math.PI / 2, 6);
    });
});

describe('findObject and findObjects', () => {
    const tank = (store: ReturnType<typeof createTestGame>['store']): TBox => startTestScene(store, 'Level', () => {
        const Part = (name: string) => {
            useSelf().name = name;
        };
        const Turret = () => {
            useSelf().name = 'Turret';
            useSpawn(Part)('Barrel');
        };
        useSpawn(Turret)();
        useSpawn(Part)('Wheel');
        useSpawn(Part)('Wheel');
        return createScene();
    });

    it('finds a part however deep it is, and the root itself', () => {
        const { store } = createTestGame();
        const root = tank(store);

        expect(findObject(root, 'Barrel')?.name).toBe('Barrel');
        expect(findObject(root, root.name)).toBe(root);
    });

    it('answers null for a name that is not there, and never throws', () => {
        const { store } = createTestGame();

        expect(findObject(tank(store), 'Cannon')).toBeNull();
    });

    it('finds every part sharing a name, and an empty list when there are none', () => {
        const { store } = createTestGame();
        const root = tank(store);

        expect(findObjects(root, 'Wheel')).toHaveLength(2);
        expect(findObjects(root, 'Cannon')).toEqual([]);
    });

    it('looks only inside where it is asked to', () => {
        const { store } = createTestGame();
        const root = tank(store);
        const turret = findObject(root, 'Turret')!;

        expect(findObject(turret, 'Barrel')).not.toBeNull();
        expect(findObject(turret, 'Wheel')).toBeNull();
    });
});
