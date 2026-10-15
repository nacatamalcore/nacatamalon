import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useCubeGeometry } from '../src/hooks/geometry';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { localToWorld, localToWorld3d, worldToLocal, worldToLocal3d } from '../src/box';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TMesh } from '../src/gameobjects/mesh/types/t_mesh';

/**
 * A point of the world measured on an object, and a point of an object found in the world, through
 * everything above it. Each pair is also checked to undo itself.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const flat = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });

const near = (got: Record<string, number>, want: Record<string, number>): void => {
    for (const key of Object.keys(want)) {
        expect(got[key]).toBeCloseTo(want[key], 6);
    }
};

describe('a point on a flat object', () => {
    const tank = () => {
        const { store } = createTestGame();
        let barrel!: TSprite;
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Platoon() {
                useTransform({ x: 100, y: 50 });
                useSpawn(function Turret() {
                    // A quarter turn and twice the size: its +x now points along the world's +y.
                    useTransform({ x: 0, y: 0, rotation: Math.PI / 2, scaleX: 2, scaleY: 2 });
                    barrel = createSprite({ width: 4, height: 4, tint, transform: flat(10, 0) });
                })();
            })();
            return createScene();
        });
        return { turret: root.children[0].children[0], barrel: () => barrel };
    };

    it('is found in the world through every object above it', () => {
        const { turret } = tank();
        near(localToWorld(turret, { x: 24, y: 0 }), { x: 100, y: 98 });
    });

    it('comes back to where it was measured from', () => {
        const { turret } = tank();
        const point = { x: 37, y: -12 };
        near(worldToLocal(turret, localToWorld(turret, point)), point);
        near(worldToLocal(turret, { x: 100, y: 98 }), { x: 24, y: 0 });
    });

    it('can be measured on a sprite, which sits inside its object', () => {
        const { barrel } = tank();
        // The barrel at 10 along the turret, doubled and turned: twenty up from the platoon.
        near(localToWorld(barrel(), { x: 0, y: 0 }), { x: 100, y: 70 });
        near(worldToLocal(barrel(), { x: 100, y: 70 }), { x: 0, y: 0 });
    });

    it('on an object placed by its picture, is the same as on that picture', () => {
        const { store } = createTestGame();
        let sprite!: TSprite;
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Paddle() {
                sprite = createSprite({ width: 32, height: 4, tint, transform: { x: 160, y: 200, rotation: 0.3, scaleX: 1, scaleY: 1 } });
            })();
            return createScene();
        });
        const point = { x: 12, y: 5 };
        near(localToWorld(root.children[0], point), localToWorld(sprite, point));
    });

    it('on a sprite made straight in the scene, is its own placement', () => {
        const { store } = createTestGame();
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({ width: 8, height: 8, tint, transform: { x: 40, y: 60, rotation: 0, scaleX: 3, scaleY: 3 } });
            return createScene();
        });
        near(localToWorld(sprite, { x: 2, y: 1 }), { x: 46, y: 63 });
    });
});

describe('a point on an object in space', () => {
    const room = () => {
        const { store } = createTestGame();
        let cube!: TMesh;
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Room() {
                // A quarter turn about Y: the room's +x now points along -z.
                useTransform({ x: 100, y: 0, z: 0, rotationY: Math.PI / 2, scaleX: 2, scaleY: 2, scaleZ: 2 });
                useSpawn(function Crate() {
                    useTransform({ x: 5, y: 1, z: 0 });
                })();
                cube = createMesh({ geometry: useCubeGeometry(), transform: { x: 1, y: 0, z: 0 } });
            })();
            return createScene();
        });
        return { crate: root.children[0].children[0], cube: () => cube };
    };

    it('is found in space through every object above it', () => {
        const { crate } = room();
        // The crate is at 100, 2, -10; one along its x, doubled and turned, is two further to -z.
        near(localToWorld3d(crate, { x: 1, y: 0, z: 0 }), { x: 100, y: 2, z: -12 });
    });

    it('comes back to where it was measured from', () => {
        const { crate } = room();
        const point = { x: 0.4, y: -3, z: 7 };
        near(worldToLocal3d(crate, localToWorld3d(crate, point)), point);
    });

    it('can be measured on a model, which sits inside its object', () => {
        const { cube } = room();
        near(localToWorld3d(cube(), { x: 0, y: 0, z: 0 }), { x: 100, y: 0, z: -2 });
        near(worldToLocal3d(cube(), { x: 100, y: 0, z: -2 }), { x: 0, y: 0, z: 0 });
    });
});
