import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { registerPhysicsProvider } from '../src/physics';
import { physics2dProvider, getPhysicsBody2d } from '../src/physics/box2d/provider';
import { loadBox2D } from '../src/physics/box2d/load_box2d';
import { useJoint2d } from '../src/physics/box2d/use_joint_2d';
import { createTestGame, startTestScene } from './helpers/test_game';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { usePhysicsBody2d, usePhysicsWorld2d } from '../src/hooks/physics';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { stopScene } from '../src/scene/stop_scene';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';

/**
 * The 2D world at its edges: what a game does now and then and the ordinary tests do not, each of which
 * once broke the simulation. A body of no size, a polygon of many corners, two triggers over each other,
 * a hinge between turned bodies, scenes that end before the physics has loaded, and a very fast shot.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const FRAME = 1 / 60;
const at = (x: number, y: number, rotation = 0) => ({ x, y, rotation, scaleX: 1, scaleY: 1 });

beforeEach(() => {
    registerPhysicsProvider(physics2dProvider);
});

afterEach(() => {
    registerPhysicsProvider(null);
});

const run = async (root: Parameters<typeof runHookUpdates>[0], frames: number): Promise<void> => {
    await loadBox2D();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < frames; i++) runHookUpdates(root, FRAME);
};

/**
 * A still floor 400 wide whose top is at y = 190.
 */
const Floor = () => {
    createSprite({ width: 400, height: 20, tint, transform: at(0, 200) });
    usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 400, height: 20 } });
};

describe('the 2D world at its edges', () => {
    it('keeps a body of no size where it is, and the rest of the world working', async () => {
        const { store } = createTestGame();
        const sprites: TSprite[] = [];
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(Floor)();
            useSpawn(() => {
                sprites.push(createSprite({ width: 8, height: 8, tint, transform: at(-40, 100) }));
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 0, height: 8 } });
            })();
            useSpawn(() => {
                sprites.push(createSprite({ width: 8, height: 8, tint, transform: at(0, 100) }));
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'circle', radius: 0 } });
            })();
            useSpawn(() => {
                sprites.push(createSprite({ width: 16, height: 16, tint, transform: at(40, 100) }));
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 16, height: 16 } });
            })();
            return createScene();
        });

        await run(root, 120);

        for (const sprite of sprites) expect(Number.isFinite(sprite.transform.y)).toBe(true);
        // The crate beside them still lands on the floor.
        expect(sprites[2]!.transform.y).toBeCloseTo(182, 0);
    });

    it('tells a crate sliding over a polygon of many corners that it landed once, and never that it left', async () => {
        const { store } = createTestGame();
        let entered = 0;
        let left = 0;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(() => {
                // A low hill of eleven corners: more than one shape holds, so it is made of pieces.
                const top: Array<[number, number]> = [];
                for (let x = -120; x <= 120; x += 30) top.push([x, 0.001 * x * x]);
                createSprite({ width: 240, height: 40, tint, transform: at(0, 100) });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'polygon', vertices: [...top, [120, 40], [-120, 40]] }, friction: 0 });
            }, 'Hill')();
            useSpawn(() => {
                createSprite({ width: 16, height: 16, tint, transform: at(50, 92) });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 16, height: 16 }, friction: 0 });
                const body = getPhysicsBody2d(useSelf())!;
                body.setLinearVelocity(80, 0);
                body.onEnter(() => { entered++; });
                body.onExit(() => { left++; });
            }, 'Crate')();
            return createScene();
        });

        // Over where one piece of the hill meets the next (at x = 90), and not yet off its end.
        await run(root, 40);

        expect(entered).toBe(1);
        expect(left).toBe(0);
    });

    it('tells two triggers over each other that they met once each', async () => {
        const { store } = createTestGame();
        const heard = { a: 0, b: 0 };
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 0 } });
            for (const name of ['a', 'b'] as const) {
                useSpawn(() => {
                    createSprite({ width: 20, height: 20, tint, transform: at(name === 'a' ? 0 : 10, 0) });
                    usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 }, sensor: true });
                    getPhysicsBody2d(useSelf())!.onEnter(() => { heard[name]++; });
                }, name)();
            }
            return createScene();
        });

        await run(root, 10);

        expect(heard).toEqual({ a: 1, b: 1 });
    });

    it('keeps a hinge between two turned bodies where it was made, its limits measured from there', async () => {
        const { store } = createTestGame();
        let bar!: TGameObject;
        let sprite!: TSprite;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 0 } });
            // Turned half a turn and a quarter the other way: more than half a turn apart.
            const pivot = useSpawn(() => {
                createSprite({ width: 4, height: 4, tint, transform: at(100, 100, Math.PI) });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 4, height: 4 } });
            }, 'Pivot')();
            bar = useSpawn(() => {
                sprite = createSprite({ width: 6, height: 60, tint, transform: at(130, 100, -Math.PI / 2) });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 6, height: 60 } });
            }, 'Bar')();
            useJoint2d(bar, pivot, { type: 'hinge', at: { x: 100, y: 100 }, limits: [-0.1, 0.1] });
            return createScene();
        });

        await run(root, 10);

        expect(sprite.transform.rotation).toBeCloseTo(-Math.PI / 2, 2);
    });

    it('opens no world for a scene that ends before the physics has loaded, so later scenes still have one', async () => {
        // More scenes than the simulation can hold worlds at once, each over before its world was made.
        for (let i = 0; i < 140; i++) {
            const { store } = createTestGame();
            startTestScene(store, 'Level', () => {
                usePhysicsWorld2d();
                return createScene();
            });
            stopScene(store, 'Level');
        }

        const { store } = createTestGame();
        let crate!: TSprite;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(Floor)();
            useSpawn(() => {
                crate = createSprite({ width: 16, height: 16, tint, transform: at(0, 100) });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 16, height: 16 } });
            })();
            return createScene();
        });

        await run(root, 120);

        expect(crate.transform.y).toBeCloseTo(182, 0);
    });

    it('lets a shot go as fast as the game sends it', async () => {
        const { store } = createTestGame();
        let shot!: TSprite;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 0 } });
            useSpawn(() => {
                shot = createSprite({ width: 4, height: 4, tint, transform: at(0, 0) });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'circle', radius: 2 } });
                getPhysicsBody2d(useSelf())!.setLinearVelocity(12000, 0);
            })();
            return createScene();
        });

        await run(root, 6);

        // A tenth of a second at twelve thousand pixels a second.
        expect(shot.transform.x).toBeGreaterThan(1150);
    });
});
