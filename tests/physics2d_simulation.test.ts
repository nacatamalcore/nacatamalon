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
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TRuntimeStore } from '../src/store';
import type { TPhysicsBodyHandle2d } from '../src/physics/rapier2d/types';

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

/**
 * Frames as the game runs them: the updates, then the sweep that finishes what `destroy` queued.
 * `run` above leaves the sweep out, because nothing it drives destroys anything.
 */
const runFrames = async (store: TRuntimeStore, root: TGameObject, frames: number): Promise<void> => {
    await loadRapier2D();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < frames; i++) {
        runHookUpdates(root, FRAME);
        flushDestroyed(store);
    }
};

/**
 * A destroyed object used to keep its body: the sprite went and an invisible wall stayed where it
 * was, the case a peg board hit first (the ball bounced off pegs that were no longer drawn).
 */
describe('a destroyed object', () => {
    it('takes its body with it, so nothing collides with where it used to be', async () => {
        const { store } = createTestGame();
        let floor!: TGameObject;
        let ball!: ReturnType<typeof createSprite>;
        let world!: ReturnType<typeof getPhysicsWorld2d>;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            world = getPhysicsWorld2d();
            useSpawn(function Floor() {
                createSprite({ width: 200, height: 20, tint, transform: { x: 0, y: 100, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 200, height: 20 } });
                floor = useSelf();
            })();
            useSpawn(function Ball() {
                ball = createSprite({ width: 20, height: 20, tint, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'circle', radius: 10 } });
            })();
            return createScene();
        });

        await runFrames(store, root, 120);
        // Resting on the floor: its centre a radius above the floor's top edge.
        expect(ball.transform.y).toBeCloseTo(80, 0);

        destroy(floor);
        await runFrames(store, root, 60);

        expect(ball.transform.y).toBeGreaterThan(200);
        expect(world?.bodyOf(floor)).toBeNull();
    });

    it('can destroy itself from the contact that hit it, and is heard only once', async () => {
        const { store } = createTestGame();
        let heard = 0;
        let ball!: ReturnType<typeof createSprite>;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(function Peg() {
                createSprite({ width: 20, height: 20, tint, transform: { x: 0, y: 100, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'circle', radius: 10 } });
                const self = useSelf();
                const body = getPhysicsWorld2d()?.bodyOf(self);
                if (body) {
                    useSignal(body.onEnter, () => {
                        heard++;
                        destroy(self);
                    });
                }
            })();
            useSpawn(function Ball() {
                ball = createSprite({ width: 20, height: 20, tint, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'circle', radius: 10 } });
            })();
            return createScene();
        });

        await runFrames(store, root, 120);

        expect(heard).toBe(1);
        // Through the gap the peg left, instead of bouncing off a peg nobody can see.
        expect(ball.transform.y).toBeGreaterThan(200);
    });

    it('ignores a push from a handle kept after it was destroyed', async () => {
        const { store } = createTestGame();
        let crate!: TGameObject;
        let kept!: NonNullable<ReturnType<NonNullable<ReturnType<typeof getPhysicsWorld2d>>['bodyOf']>>;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(function Crate() {
                createSprite({ width: 20, height: 20, tint, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
                crate = useSelf();
                kept = getPhysicsWorld2d()!.bodyOf(crate)!;
            })();
            return createScene();
        });
        await runFrames(store, root, 1);

        destroy(crate);
        await runFrames(store, root, 1);

        expect(() => {
            kept.applyImpulse(100, 0);
            kept.applyForce(100, 0);
            kept.setLinearVelocity(1, 0);
            kept.setAngularVelocity(1);
        }).not.toThrow();
        await runFrames(store, root, 10);
    });
});

/**
 * A body changed while the game runs, without destroying its object.
 */
describe('a body changed at runtime', () => {
    /**
     * A floor and a ball above it, with the ball's handle and the floor's caught while building.
     */
    const floorAndBall = (store: TRuntimeStore, onBuilt?: (ball: TPhysicsBodyHandle2d) => void) => {
        const found: { floor?: TPhysicsBodyHandle2d; ball?: TPhysicsBodyHandle2d; ballObject?: TGameObject; ballSprite?: ReturnType<typeof createSprite> } = {};
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(function Floor() {
                createSprite({ width: 200, height: 20, tint, transform: { x: 0, y: 100, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 200, height: 20 } });
                found.floor = getPhysicsWorld2d()!.bodyOf(useSelf())!;
            })();
            useSpawn(function Ball() {
                found.ballSprite = createSprite({ width: 20, height: 20, tint, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'circle', radius: 10 } });
                found.ballObject = useSelf();
                found.ball = getPhysicsWorld2d()!.bodyOf(found.ballObject)!;
                onBuilt?.(found.ball);
            })();
            return createScene();
        });
        return { root, ...found as Required<typeof found> };
    };

    it('stops colliding with a layer it has left, and the record says so', async () => {
        const { store } = createTestGame();
        const { root, ball, ballObject, ballSprite } = floorAndBall(store);

        await runFrames(store, root, 120);
        expect(ballSprite.transform.y).toBeCloseTo(80, 0);

        // Layer 1, meeting only layer 1: the floor is on layer 0.
        ball.setLayers(1, 1 << 1);
        await runFrames(store, root, 60);

        expect(ballSprite.transform.y).toBeGreaterThan(200);
        expect(ballObject.physics).toMatchObject({ layer: 1, collidesWith: 1 << 1 });
    });

    it('applies layers set before the WebAssembly has landed', async () => {
        const { store } = createTestGame();
        const { root, ballSprite } = floorAndBall(store, (ball) => ball.setLayers(1, 1 << 1));

        await runFrames(store, root, 60);

        expect(ballSprite.transform.y).toBeGreaterThan(200);
    });

    it('takes a body out with destroy() and leaves its object alone', async () => {
        const { store } = createTestGame();
        const { root, floor, ballSprite } = floorAndBall(store);
        await runFrames(store, root, 120);

        floor.destroy();
        floor.destroy();
        await runFrames(store, root, 60);

        expect(ballSprite.transform.y).toBeGreaterThan(200);
        // The floor object is still there, still drawn: only its body left.
        expect(root.children[0].destroyed).toBe(false);
        expect(root.children[0].drawables.length).toBe(1);
    });
});

describe('a kinematic body', () => {
    it('moves with the velocity it is given, which is how llms.txt tells a game to move one', async () => {
        const { store } = createTestGame();
        let platform!: ReturnType<typeof createSprite>;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(function Platform() {
                platform = createSprite({ width: 60, height: 10, tint, transform: { x: 0, y: 100, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'kinematic', collider: { shape: 'rect', width: 60, height: 10 } });
                getPhysicsWorld2d()?.bodyOf(useSelf())?.setLinearVelocity(60, 0);
            })();
            return createScene();
        });

        await runFrames(store, root, 60);

        // About a second at 60 pixels a second, and gravity has no say over it.
        expect(platform.transform.x).toBeCloseTo(60, -1);
        expect(platform.transform.y).toBeCloseTo(100, 3);
    });
});
