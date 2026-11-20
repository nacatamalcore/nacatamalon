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
import * as H from '../src/hooks/physics';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import { stopScene } from '../src/scene/stop_scene';

const F = 1 / 60;
const tint = { r: 1, g: 1, b: 1, a: 1 };
afterEach(() => registerPhysicsProvider(null));
const steps = (root: any, n: number) => { for (let i = 0; i < n; i++) runHookUpdates(root, F); };

const run3d = async (withLeg: boolean, end: 'scene' | 'holder') => {
    registerPhysicsProvider(physics3dProvider);
    const { store } = createTestGame();
    let exits = 0, enters = 0;
    const root = startTestScene(store, 'L', () => {
        H.usePhysicsWorld3d();
        useSpawn(function Floor() {
            useTransform({ y: -0.5 });
            H.usePhysicsBody3d({ body: 'static', collider: { shape: 'box', size: [20, 1, 20] } });
            getPhysicsBody3d(useSelf())?.onExit(() => { exits++; });
        })();
        useSpawn(function Holder() {
            useSpawn(function Post() {
                useTransform({ y: withLeg ? 1 : 0.5 });
                H.usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [0.4, 0.4, 0.4] } });
                getPhysicsBody3d(useSelf())?.onEnter(() => { enters++; });
                getPhysicsBody3d(useSelf())?.onExit(() => { exits++; });
                if (withLeg) useSpawn(function Leg() {
                    useTransform({ y: -0.6 });
                    H.useCollisionShape3d({ collider: { shape: 'box', size: [0.4, 0.4, 0.4] } });
                })();
            })();
        })();
        return createScene();
    });
    await loadBox3D(); await new Promise((r) => setTimeout(r, 0));
    steps(root, 200);
    expect(enters).toBe(1);
    if (end === 'scene') stopScene(store, root);
    else { destroy(root.children[1]); flushDestroyed(store); }
    return exits;
};

const run2d = async (withLeg: boolean, end: 'scene' | 'holder') => {
    registerPhysicsProvider(physics2dProvider);
    const { store } = createTestGame();
    let exits = 0, enters = 0;
    const root = startTestScene(store, 'L', () => {
        H.usePhysicsWorld2d();
        useSpawn(function Ground() {
            createSprite({ width: 400, height: 20, tint, transform: { x: 0, y: 210, rotation: 0, scaleX: 1, scaleY: 1 } });
            H.usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 400, height: 20 } });
            getPhysicsBody2d(useSelf())?.onExit(() => { exits++; });
        })();
        useSpawn(function Holder() {
            useSpawn(function Post() {
                useTransform({ x: 0, y: withLeg ? 100 : 150 });
                H.usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
                getPhysicsBody2d(useSelf())?.onEnter(() => { enters++; });
                getPhysicsBody2d(useSelf())?.onExit(() => { exits++; });
                if (withLeg) useSpawn(function Leg() {
                    useTransform({ y: 30 });
                    H.useCollisionShape2d({ collider: { shape: 'rect', width: 20, height: 20 } });
                })();
            })();
        })();
        return createScene();
    });
    await loadBox2D(); await new Promise((r) => setTimeout(r, 0));
    steps(root, 300);
    expect(enters).toBe(1);
    if (end === 'scene') stopScene(store, root);
    else { destroy(root.children[1]); flushDestroyed(store); }
    return exits;
};

describe('teardown: no onExit while a body is torn down', () => {
    for (const end of ['scene', 'holder'] as const) {
        it(`in space, taken down with what holds it (${end}), a body of one shape parts from nothing`, async () => { expect(await run3d(false, end)).toBe(0); });
        it(`in space, taken down with what holds it (${end}), a body with shapes under it parts from nothing`, async () => { expect(await run3d(true, end)).toBe(0); });
        it(`flat, taken down with what holds it (${end}), a body of one shape parts from nothing`, async () => { expect(await run2d(false, end)).toBe(0); });
        it(`flat, taken down with what holds it (${end}), a body with shapes under it parts from nothing`, async () => { expect(await run2d(true, end)).toBe(0); });
    }
});
