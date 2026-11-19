import { afterEach, describe, expect, it } from 'bun:test';
import { registerPhysicsProvider } from '../src/physics';
import { physics3dProvider, getPhysicsBody3d } from '../src/physics/box3d/provider';
import { physics2dProvider, getPhysicsBody2d } from '../src/physics/box2d/provider';
import { loadBox3D } from '../src/physics/box3d/load_box3d';
import { loadBox2D } from '../src/physics/box2d/load_box2d';
import { createTestGame, startTestScene } from './helpers/test_game';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useCollisionShape2d, useCollisionShape3d, usePhysicsBody2d, usePhysicsBody3d, usePhysicsWorld2d, usePhysicsWorld3d } from '../src/hooks/physics';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';

const tint = { r: 1, g: 1, b: 1, a: 1 };
const F = 1 / 60;
afterEach(() => registerPhysicsProvider(null));
const steps = (root: TGameObject, n: number) => { for (let i = 0; i < n; i++) runHookUpdates(root, F); };
const Floor3d = () => {
    useTransform({ y: -0.5 });
    usePhysicsBody3d({ body: 'static', collider: { shape: 'box', size: [20, 1, 20] } });
};

describe('3d', () => {
    it('a shape taken away while touching: the bodies part, and meet again when they touch', async () => {
        registerPhysicsProvider(physics3dProvider);
        const { store } = createTestGame();
        let enters = 0, exits = 0;
        const root = startTestScene(store, 'L', () => {
            usePhysicsWorld3d();
            useSpawn(Floor3d)();
            useSpawn(function Post() {
                useTransform({ y: 1 });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [0.4, 0.4, 0.4] } });
                getPhysicsBody3d(useSelf())?.onEnter(() => { enters++; });
                getPhysicsBody3d(useSelf())?.onExit(() => { exits++; });
                useSpawn(function Leg() {
                    useTransform({ y: -0.6 });
                    useCollisionShape3d({ collider: { shape: 'box', size: [0.4, 0.4, 0.4] } });
                })();
            })();
            return createScene();
        });
        await loadBox3D(); await new Promise((r) => setTimeout(r, 0));
        steps(root, 200);
        expect(enters).toBe(1);
        destroy(root.children[1].children[0]); flushDestroyed(store);
        steps(root, 200);
        console.log('3d enters', enters, 'exits', exits, 'y', root.children[1].transform!.y);
        // the own shape now rests on the floor: a new touch
        expect(root.children[1].transform!.y).toBeCloseTo(0.2, 1);
        expect(enters).toBe(2);
    });

    it('a shape that says only its bounce keeps the rest of its body surface', async () => {
        registerPhysicsProvider(physics3dProvider);
        const { store } = createTestGame();
        const root = startTestScene(store, 'L', () => {
            usePhysicsWorld3d();
            useSpawn(Floor3d)();
            useSpawn(function Ghost() {
                useTransform({ y: 2 });
                usePhysicsBody3d({ body: 'dynamic', sensor: true, collider: null });
                useSpawn(function Part() {
                    useCollisionShape3d({ collider: { shape: 'box', size: [0.5, 0.5, 0.5] }, bounce: 0.1 });
                })();
            })();
            return createScene();
        });
        await loadBox3D(); await new Promise((r) => setTimeout(r, 0));
        steps(root, 200);
        console.log('3d sensor body y', root.children[1].transform!.y);
        // A sensor body falls through the floor
        expect(root.children[1].transform!.y).toBeLessThan(-1);
    });
});

describe('2d', () => {
    it('a flat shape taken away while touching: the bodies part, and meet again', async () => {
        registerPhysicsProvider(physics2dProvider);
        const { store } = createTestGame();
        let enters = 0, exits = 0;
        const root = startTestScene(store, 'L', () => {
            usePhysicsWorld2d();
            useSpawn(function Ground() {
                createSprite({ width: 400, height: 20, tint, transform: { x: 0, y: 210, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 400, height: 20 } });
            })();
            useSpawn(function Post() {
                useTransform({ x: 0, y: 100 });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
                getPhysicsBody2d(useSelf())?.onEnter(() => { enters++; });
                getPhysicsBody2d(useSelf())?.onExit(() => { exits++; });
                useSpawn(function Leg() {
                    useTransform({ y: 30 });
                    useCollisionShape2d({ collider: { shape: 'rect', width: 20, height: 20 } });
                })();
            })();
            return createScene();
        });
        await loadBox2D(); await new Promise((r) => setTimeout(r, 0));
        steps(root, 300);
        expect(enters).toBe(1);
        destroy(root.children[1].children[0]); flushDestroyed(store);
        steps(root, 300);
        console.log('2d enters', enters, 'exits', exits, 'y', root.children[1].transform!.y);
        expect(root.children[1].transform!.y).toBeCloseTo(190, 0);
        expect(enters).toBe(2);
    });
});
