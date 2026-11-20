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
const F = 1 / 60;
afterEach(() => registerPhysicsProvider(null));
const steps = (root: TGameObject, n: number) => { for (let i = 0; i < n; i++) runHookUpdates(root, F); };
const tint = { r: 1, g: 1, b: 1, a: 1 };
for (const own of [true, false]) it('a flat body put on other layers before the world loads takes its shapes with it, ' + (own ? 'with a shape of its own' : 'with none of its own'), async () => {
    registerPhysicsProvider(physics2dProvider);
    const { store } = createTestGame();
    const root = startTestScene(store, 'L', () => {
        usePhysicsWorld2d();
        useSpawn(function Ground() {
            createSprite({ width: 400, height: 20, tint, transform: { x: 0, y: 210, rotation: 0, scaleX: 1, scaleY: 1 } });
            usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 400, height: 20 } });
        })();
        useSpawn(function Ghost() {
            useTransform({ x: 0, y: 100 });
            usePhysicsBody2d({ body: 'dynamic', collider: own ? { shape: 'rect', width: 20, height: 20 } : null });
            useSpawn(function Part() { useTransform({ x: 50 }); useCollisionShape2d({ collider: { shape: 'rect', width: 20, height: 20 } }); })();
            getPhysicsBody2d(useSelf())!.setLayers(3, [3]);
        })();
        return createScene();
    });
    await loadBox2D(); await new Promise((r) => setTimeout(r, 0));
    steps(root, 300);
    expect(root.children[1].transform!.y).toBeGreaterThan(300);
});
