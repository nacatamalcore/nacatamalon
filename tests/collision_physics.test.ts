import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { registerPhysicsProvider } from '../src/physics';
import { rapier2dProvider } from '../src/physics/rapier2d/provider';
import { loadRapier2D } from '../src/physics/rapier2d/load_rapier';
import { box3dProvider } from '../src/physics/box3d/provider';
import { loadBox3D } from '../src/physics/box3d/load_box3d';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { usePhysicsBody2d, usePhysicsBody3d, usePhysicsWorld2d, usePhysicsWorld3d } from '../src/hooks/physics';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useCollisionBetween, useCollisionWith } from '../src/hooks/hitbox';
import { createTestGame } from './helpers/test_game';
import type { TSceneFn } from '../src/scene';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';

/**
 * Collisions asked by component or by tag, met through physics bodies: nothing here draws or has a
 * hitbox, so the only way a crate can know it landed is the simulation telling it.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

beforeEach(() => { registerPhysicsProvider(rapier2dProvider); registerPhysicsProvider(box3dProvider); });
afterEach(() => { registerPhysicsProvider(null); });

const game = async (body: TSceneFn) => {
    await loadRapier2D();
    await loadBox3D();
    const { store } = createTestGame({ step: 60 });
    const ctx = createFrameContext();
    let now = 0;
    registerScene(store, 'Level', body);
    startScene(store, 'Level');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const frames = (count: number): void => {
        for (let i = 0; i < count; i++) {
            const prev = now;
            now += 1000 / 60;
            tick(store, ctx, now, prev);
        }
    };
    return { frames };
};

const Ground = () => {
    useTransform({ x: 0, y: 100 });
    usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 200, height: 20 } });
};

describe('a collision met by physics', () => {
    it('tells a falling body when it lands on what it asked for, by component and by tag', async () => {
        const said: string[] = [];
        const { frames } = await game(() => {
            usePhysicsWorld2d();
            useSpawn(Ground, { name: 'Ground', tags: ['floor'] })();
            useSpawn(() => {
                useTransform({ x: 0, y: 0 });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
                useCollisionWith(Ground, (ground) => said.push(`component ${ground.name}`), { when: 'start' });
                useCollisionWith('floor', (floor) => said.push(`tag ${(floor as TGameObject).name}`), { when: 'start' });
            }, 'Crate')();
            return createScene();
        });

        frames(10);
        expect(said).toEqual([]);
        frames(120);
        expect(said.sort()).toEqual(['component Ground', 'tag Ground']);
    });

    it('meets in a rule of the scene too', async () => {
        let landed = 0;
        const { frames } = await game(() => {
            usePhysicsWorld2d();
            useSpawn(Ground, 'Ground')();
            const Crate = () => {
                useTransform({ x: 0, y: 0 });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
            };
            useSpawn(Crate)();
            useCollisionBetween(Crate, Ground, () => { landed++; });
            return createScene();
        });

        frames(130);
        expect(landed).toBeGreaterThan(0);
    });

    it('in space as well: a box lands on a floor', async () => {
        const said: string[] = [];
        const Floor = () => {
            useTransform({ y: -0.5, scaleX: 20, scaleZ: 20 });
            usePhysicsBody3d({ body: 'static', collider: { shape: 'box', size: [1, 1, 1] } });
        };
        const { frames } = await game(() => {
            usePhysicsWorld3d();
            useSpawn(Floor, 'Floor')();
            useSpawn(() => {
                useTransform({ y: 3 });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } });
                useCollisionWith(Floor, (floor) => said.push(floor.name), { when: 'start' });
            }, 'Box')();
            return createScene();
        });

        frames(5);
        expect(said).toEqual([]);
        frames(120);
        expect(said).toEqual(['Floor']);
    });
});
