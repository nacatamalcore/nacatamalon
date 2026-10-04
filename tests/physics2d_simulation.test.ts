import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { registerPhysicsProvider } from '../src/physics';
import { rapier2dProvider, getPhysicsWorld2d } from '../src/physics/rapier2d/provider';
import { loadRapier2D } from '../src/physics/rapier2d/load_rapier';
// Internals by relative path, the way the engine's own tests reach them: a published game has no
// use for a frame it drives by hand, so none of this belongs on the front door.
import { createTestGame, startTestScene } from './helpers/test_game';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { usePhysicsBody2d, usePhysicsWorld2d } from '../src/hooks/physics';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSignal } from '../src/hooks/signal/use_signal';
import { stopScene } from '../src/scene/stop_scene';

/**
 * The half that only simulating proves, kept to what would break silently in this port.
 *
 * The provider's mapping is read next door without loading the WebAssembly. What is here needs
 * Rapier to have actually run.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const FRAME = 1 / 60;

beforeEach(() => {
    registerPhysicsProvider(rapier2dProvider);
});

afterEach(() => {
    registerPhysicsProvider(null);
});

/**
 * Runs frames once the WebAssembly has landed, which is what the browser's first frames wait for.
 */
const run = async (root: Parameters<typeof runHookUpdates>[0], frames: number): Promise<void> => {
    await loadRapier2D();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < frames; i++) {
        runHookUpdates(root, FRAME);
    }
};

describe('a listener that ends the scene', () => {
    it('does not leave the world stepping memory it has just freed', async () => {
        // A door: the sensor's answer changes the room, which tears this scene down on the spot,
        // while Rapier is still handing out the events of the step that reported the overlap.
        const { store } = createTestGame();
        let heard = 0;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(function Door() {
                createSprite({ width: 200, height: 20, tint, transform: { x: 0, y: 100, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 200, height: 20 }, sensor: true });
                const body = getPhysicsWorld2d()?.bodyOf(useSelf());
                if (body) {
                    useSignal(body.onEnter, () => {
                        heard++;
                        stopScene(store, 'Level');
                    });
                }
            })();
            // Two walkers, so the step that ends the scene still has an overlap left to report.
            for (const x of [-40, 40]) {
                useSpawn(function Walker() {
                    createSprite({ width: 20, height: 20, tint, transform: { x, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
                    usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
                })();
            }
            return createScene();
        });

        await run(root, 240);

        expect(heard).toBe(1);
    });
});

/**
 * Two things the adapter's types now catch, and once did not: a force that never woke the body it
 * was meant to move, and a polygon with no area that broke the body being built, with no message.
 */
describe('what the typing caught', () => {
    it('moves a body that has fallen asleep when a force is applied to it', async () => {
        const { store } = createTestGame();
        let crate!: ReturnType<typeof createSprite>;
        let push!: (x: number, y: number) => void;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 0 } });
            useSpawn(function Crate() {
                crate = createSprite({ width: 20, height: 20, tint, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
                const body = getPhysicsWorld2d()?.bodyOf(useSelf());
                push = (x, y) => body?.applyForce(x, y);
            })();
            return createScene();
        });

        // Long enough at rest for Rapier to put it to sleep.
        await run(root, 300);
        const before = crate.transform.x;
        push(200000, 0);
        await run(root, 60);

        expect(crate.transform.x).toBeGreaterThan(before + 1);
    });

    it('keeps a body whose polygon encloses no area, says why, and does not break the scene', async () => {
        const warned: string[] = [];
        const original = console.warn;
        console.warn = (message: string) => { warned.push(String(message)); };
        try {
            const { store } = createTestGame();
            const root = startTestScene(store, 'Level', () => {
                usePhysicsWorld2d();
                useSpawn(function Line() {
                    createSprite({ width: 20, height: 20, tint });
                    // Three points on one line: no area, so no hull.
                    usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'polygon', vertices: [[0, 0], [10, 0], [20, 0]] } });
                })();
                return createScene();
            });
            await run(root, 10);
        } finally {
            console.warn = original;
        }

        expect(warned.some((message) => message.includes('encloses no area'))).toBe(true);
    });
});
