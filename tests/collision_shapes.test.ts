import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { registerPhysicsProvider } from '../src/physics';
import { physics3dProvider, getPhysicsBody3d } from '../src/physics/box3d/provider';
import { physics2dProvider } from '../src/physics/box2d/provider';
import { loadBox3D } from '../src/physics/box3d/load_box3d';
import { loadBox2D } from '../src/physics/box2d/load_box2d';
import { createTestGame, startTestScene } from './helpers/test_game';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useCubeGeometry } from '../src/hooks/geometry';
import { useCollisionShape2d, useCollisionShape3d, usePhysicsBody2d, usePhysicsBody3d, usePhysicsWorld2d, usePhysicsWorld3d } from '../src/hooks/physics';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import { parseSceneDoc } from '../src/scene/document/parse_scene_doc';
import { serializeScene } from '../src/scene/document/serialize_scene';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';

/**
 * A body made of several shapes, each on an object of its own under the body's, which places it:
 * turned, apart, sized. What only simulating proves is that the whole moves as one and rests on the
 * shapes where they are, not where the body's object is.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const FRAME = 1 / 60;

afterEach(() => {
    registerPhysicsProvider(null);
});

const run3d = async (root: TGameObject, frames: number): Promise<void> => {
    await loadBox3D();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < frames; i++) runHookUpdates(root, FRAME);
};

const run2d = async (root: TGameObject, frames: number): Promise<void> => {
    await loadBox2D();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < frames; i++) runHookUpdates(root, FRAME);
};

/** A floor whose top is at y = 0. */
const Floor3d = () => {
    useTransform({ y: -0.5, scaleX: 20, scaleZ: 20 });
    createMesh({ geometry: useCubeGeometry(), tint });
    usePhysicsBody3d({ body: 'static', collider: { shape: 'box', size: [1, 1, 1] } });
};

describe('shapes in space', () => {
    it('a capsule turned to lie across its body rests on its side, not standing', async () => {
        registerPhysicsProvider(physics3dProvider);
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor3d)();
            useSpawn(function Ring() {
                useTransform({ y: 3 });
                usePhysicsBody3d({ body: 'dynamic', collider: null });
                useSpawn(function Bar() {
                    // A quarter turn about Z lays the capsule along X.
                    useTransform({ rotation: Math.PI / 2 });
                    useCollisionShape3d({ collider: { shape: 'capsule', radius: 0.2, height: 2 } });
                })();
            })();
            return createScene();
        });
        const ring = root.children[1];

        await run3d(root, 300);
        // Lying, it is as high as its radius; standing it would be half its height.
        expect(ring.transform!.y).toBeCloseTo(0.2, 1);
    });

    it('two shapes apart move as one body, and meet the floor once', async () => {
        registerPhysicsProvider(physics3dProvider);
        const { store } = createTestGame();
        let entered = 0;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor3d)();
            useSpawn(function Dumbbell() {
                useTransform({ y: 2 });
                usePhysicsBody3d({ body: 'dynamic', collider: null });
                getPhysicsBody3d(useSelf())?.onEnter(() => { entered++; });
                for (const x of [-1, 1]) {
                    useSpawn(function Weight() {
                        useTransform({ x });
                        useCollisionShape3d({ collider: { shape: 'box', size: [0.5, 0.5, 0.5] } });
                    })();
                }
            })();
            return createScene();
        });
        const dumbbell = root.children[1];

        await run3d(root, 300);
        // Both weights on the floor: level, at their half height.
        expect(dumbbell.transform!.y).toBeCloseTo(0.25, 1);
        expect(Math.abs(dumbbell.transform!.x ?? 0)).toBeLessThan(0.05);
        // Two of its shapes touch the floor, and it met the floor once.
        expect(entered).toBe(1);
    });

    it('a shape beside its body on one object is one more shape of that body', async () => {
        registerPhysicsProvider(physics3dProvider);
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor3d)();
            useSpawn(function Post() {
                useTransform({ y: 3 });
                // Its own shape is a small box; the shape beside it, offset down, is a wide base.
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [0.2, 0.2, 0.2] } });
                useCollisionShape3d({ collider: { shape: 'box', size: [2, 0.4, 2] }, offset: [0, -1, 0] });
            })();
            return createScene();
        });
        const post = root.children[1];

        await run3d(root, 300);
        // It rests on the base: the base's middle is 1 under the object, and half its height above 0.
        expect(post.transform!.y).toBeCloseTo(1.2, 1);
    });

    it('a shape whose object is destroyed is taken off its body', async () => {
        registerPhysicsProvider(physics3dProvider);
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor3d)();
            useSpawn(function Stilt() {
                useTransform({ y: 3 });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'sphere', radius: 0.25 } });
                useSpawn(function Leg() {
                    useTransform({ y: -1 });
                    useCollisionShape3d({ collider: { shape: 'box', size: [2, 0.2, 2] } });
                })();
            })();
            return createScene();
        });
        const stilt = root.children[1];

        await run3d(root, 240);
        // Standing on its leg: the leg's middle is 1 under the object.
        expect(stilt.transform!.y).toBeCloseTo(1.1, 1);

        destroy(stilt.children[0]);
        flushDestroyed(store);
        await run3d(root, 240);
        // Without it, down to its own ball.
        expect(stilt.transform!.y).toBeCloseTo(0.25, 1);
    });

    it('a shape with no body above it is said, and collides as nothing', () => {
        registerPhysicsProvider(physics3dProvider);
        const warn = spyOn(console, 'warn');
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(function Lonely() {
                useTransform({ y: 1 });
                useCollisionShape3d({ collider: { shape: 'sphere', radius: 0.5 } });
            })();
            return createScene();
        });
        expect(warn.mock.calls.some((call) => String(call[0]).includes('no body above it'))).toBe(true);
        warn.mockRestore();
    });
});

describe('flat shapes', () => {
    it('a tall rectangle turned to lie on a body with none of its own rests on its long side', async () => {
        registerPhysicsProvider(physics2dProvider);
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(function Ground() {
                createSprite({ width: 400, height: 20, tint, transform: { x: 0, y: 210, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 400, height: 20 } });
            })();
            useSpawn(function Plank() {
                useTransform({ x: 0, y: 0 });
                usePhysicsBody2d({ body: 'dynamic', collider: null });
                useSpawn(function Board() {
                    useTransform({ rotation: Math.PI / 2 });
                    useCollisionShape2d({ collider: { shape: 'rect', width: 10, height: 80 } });
                })();
            })();
            return createScene();
        });
        const plank = root.children[1];

        await run2d(root, 300);
        // The ground's top is at 200; lying, the board is 10 tall, so its middle rests at 195.
        expect(plank.transform!.y).toBeCloseTo(195, 0);
    });

    it('a cart of a body and two wheels stands on its wheels', async () => {
        registerPhysicsProvider(physics2dProvider);
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(function Ground() {
                createSprite({ width: 400, height: 20, tint, transform: { x: 0, y: 210, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 400, height: 20 } });
            })();
            useSpawn(function Cart() {
                useTransform({ x: 0, y: 0 });
                createSprite({ width: 48, height: 16, tint });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 48, height: 16 } });
                for (const x of [-16, 16]) {
                    useSpawn(function Wheel() {
                        useTransform({ x, y: 12 });
                        useCollisionShape2d({ collider: { shape: 'circle', radius: 8 } });
                    })();
                }
            })();
            return createScene();
        });
        const cart = root.children[1];

        await run2d(root, 300);
        // Wheels' middles 12 under the cart, their bottoms 8 under that, on the ground at 200.
        expect(cart.transform?.y ?? 0).toBeCloseTo(180, 0);
    });
});

describe('written down', () => {
    it('a body with no shape of its own and a collision shape come back from the file as they were', () => {
        const doc = parseSceneDoc({
            format: 'nacatamalon-scene', version: 1, name: 'Level', assets: [],
            root: {
                id: 'r', name: 'Level', transform: null, children: [{
                    id: 'b', name: 'Ring', transform: null, children: [{
                        id: 's', name: 'Bar', transform: null, children: [],
                        components: [{ type: 'collision-shape-3d', id: 'c2', collider: { shape: 'capsule', radius: 0.2, height: 2 }, bounce: 0.5 }],
                    }],
                    components: [{ type: 'physics-body-3d', id: 'c1', body: 'dynamic', collider: null }],
                }],
                components: [],
            },
        }, 'level.scene');
        const ring = doc.root.children[0];
        const body = ring.components[0] as { collider: unknown };
        expect(body.collider).toBeNull();
        const shape = ring.children[0].components[0] as Record<string, unknown>;
        expect(shape.type).toBe('collision-shape-3d');
        expect(shape.collider).toEqual({ shape: 'capsule', radius: 0.2, height: 2 });
        expect(shape.offset).toEqual([0, 0, 0]);
        // Only what it said of its own surface: the rest is its body's.
        expect(shape.bounce).toBe(0.5);
        expect('friction' in shape).toBe(false);
    });

    it('a scene made in code writes its shapes down, after the body on the same object', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Chair() {
                useTransform({ y: 1 });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 0.2, 1] } });
                useCollisionShape3d({ collider: { shape: 'sphere', radius: 0.1 }, friction: 0.9 });
                useSpawn(function Back() {
                    useTransform({ y: 0.5, z: -0.5 });
                    useCollisionShape3d({ collider: { shape: 'box', size: [1, 1, 0.1] } });
                })();
            })();
            return createScene();
        });
        const doc = serializeScene(root);
        const chair = doc.root.children[0];
        expect(chair.components.map((c) => c.type)).toEqual(['physics-body-3d', 'collision-shape-3d']);
        expect((chair.components[1] as Record<string, unknown>).friction).toBe(0.9);
        expect(chair.children[0].components.map((c) => c.type)).toEqual(['collision-shape-3d']);
    });
});
