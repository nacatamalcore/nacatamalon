import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { registerPhysicsProvider } from '../src/physics';
import { box3dProvider, getPhysicsWorld3d } from '../src/physics/box3d/provider';
import { loadBox3D } from '../src/physics/box3d/load_box3d';
import { useCharacterBody } from '../src/physics/box3d/use_character_body';
// Internals by relative path, the way the engine's own tests reach them: a published game has no
// use for a frame it drives by hand, so none of this belongs on the front door.
import { createTestGame, startTestScene } from './helpers/test_game';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh';
import { useCubeGeometry, useUvSphereGeometry } from '../src/hooks/geometry';
import { usePhysicsBody3d, usePhysicsWorld3d } from '../src/hooks/physics';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useSignal } from '../src/hooks/signal/use_signal';
import { stopScene } from '../src/scene/stop_scene';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import type { TRuntimeStore } from '../src/store';
import type { TPhysicsBodyHandle3d } from '../src/physics/box3d/types';

/**
 * The half that only simulating proves.
 *
 * The mapping is read next door with a world that records instead of colliding. What is left is
 * everything that is true only once box3d has actually run: that a body **stops**, which is the
 * difference between simulating and drawing badly; that its answer is written back onto the right
 * object; that a body inside a group lands in the right place; and that a character walks up a
 * ramp and not up a wall.
 *
 * It is deliberately not the whole of the suite the other engine's adapter carries. What is here is
 * what would break silently in this port, not what box3d is already responsible for.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const FRAME = 1 / 60;

let warn: ReturnType<typeof spyOn> | null = null;

beforeEach(() => {
    registerPhysicsProvider(box3dProvider);
});

afterEach(() => {
    registerPhysicsProvider(null);
    warn?.mockRestore();
    warn = null;
});

/**
 * Runs frames of the scene's updates.
 *
 * The WebAssembly loads asynchronously and the world is created in a `.then`, so a scene that has
 * only just started has no world yet and every step would do nothing. Awaiting the memoized load
 * plus one macrotask lets that continuation land first, which is the headless stand-in for the
 * browser's first few frames.
 */
const run = async (root: TGameObject, frames: number): Promise<void> => {
    await loadBox3D();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < frames; i++) {
        runHookUpdates(root, FRAME);
    }
};

/**
 * A floor whose top surface sits at y = 0, so a body resting on it stops at its own half-height.
 */
const Floor = () => {
    useTransform({ y: -0.5, scaleX: 20, scaleZ: 20 });
    createMesh({ geometry: useCubeGeometry(), tint });
    usePhysicsBody3d({ body: 'static', collider: { shape: 'box', size: [1, 1, 1] }, friction: 0.5 });
};

describe('a body that is simulated', () => {
    it('falls, and then STOPS, which is what says it is being simulated at all', async () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor)();
            useSpawn(function Crate() {
                useTransform({ y: 6 });
                createMesh({ geometry: useCubeGeometry(), tint });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } });
            })();
            return createScene();
        });
        const crate = root.children[1];

        await run(root, 30);
        const halfway = crate.transform!.y;
        expect(halfway).toBeLessThan(6);

        await run(root, 240);
        const settled = crate.transform!.y;
        // Its own half-height above a floor whose surface is at zero.
        expect(settled).toBeCloseTo(0.5, 1);

        // And it stays there, which a body merely drawn falling would not.
        await run(root, 60);
        expect(crate.transform!.y).toBeCloseTo(settled, 3);
    });

    it('writes its answer onto what the object DRAWS when the object itself is nowhere', async () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor)();
            useSpawn(function Ball() {
                // No useTransform: the shape carries the placement, which is how most scenes in
                // this engine are written.
                createMesh({ geometry: useUvSphereGeometry({ radius: 0.5 }), tint, transform: { y: 5 } });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'sphere', radius: 0.5 } });
            })();
            return createScene();
        });
        const ball = root.children[1];

        await run(root, 300);

        // The object never got a placement of its own, so the one that moved is its shape's. The
        // other engine's adapter refused to build this body at all.
        expect(ball.transform).toBeNull();
        expect(ball.drawables[0].transform.y).toBeCloseTo(0.5, 1);
    });

    it('lands in the right place when it hangs under a group', async () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor)();
            useSpawn(function Room() {
                // The whole room stands four metres along x, which is how a level is organised.
                useTransform({ x: 4 });
                useSpawn(function Crate() {
                    useTransform({ y: 5 });
                    createMesh({ geometry: useCubeGeometry(), tint });
                    usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } });
                })();
            })();
            return createScene();
        });
        const crate = root.children[1].children[0];

        await run(root, 300);

        // Stored local, so still nothing along x (give or take the shove of landing): a body that
        // simulated at its local numbers would have fallen four metres away from its room, and one
        // stored back in world terms would now read 4.
        expect(crate.transform!.x).toBeCloseTo(0, 1);
        expect(crate.transform!.y).toBeCloseTo(0.5, 1);
    });
});

describe('a collider that only notices', () => {
    it('reports what walked into it without stopping it', async () => {
        const { store } = createTestGame();
        const seen: string[] = [];
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(function Gate() {
                useTransform({ y: 2 });
                createMesh({ geometry: useCubeGeometry(), tint });
                usePhysicsBody3d({ body: 'static', collider: { shape: 'box', size: [4, 1, 4] }, sensor: true });
                // The engine built the body and handed it here, so the handle never went to the
                // scene: this is the way back to it, and it is the whole point of `bodyOf`.
                const body = getPhysicsWorld3d()?.bodyOf(useSelf());
                if (body) {
                    useSignal(body.onEnter, (other: TGameObject) => { seen.push(other.name); });
                }
            })();
            useSpawn(function Crate() {
                useTransform({ y: 6 });
                createMesh({ geometry: useCubeGeometry(), tint });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } });
            })();
            return createScene();
        });
        const crate = root.children[1];

        await run(root, 240);

        expect(seen).toContain('Crate');
        // Straight through: a sensor notices and never resolves the contact, so the crate is
        // below the gate it passed rather than sitting on it.
        expect(crate.transform!.y).toBeLessThan(1);
    });
});

describe('a listener that ends the scene', () => {
    it('does not leave the world stepping memory it has just freed', async () => {
        // A door: the sensor's answer changes the room, which tears this scene down on the spot,
        // in the middle of the step that reported the overlap.
        const { store } = createTestGame();
        let heard = 0;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(function Door() {
                useTransform({ y: 2 });
                createMesh({ geometry: useCubeGeometry(), tint });
                usePhysicsBody3d({ body: 'static', collider: { shape: 'box', size: [4, 1, 4] }, sensor: true });
                const body = getPhysicsWorld3d()?.bodyOf(useSelf());
                if (body) {
                    useSignal(body.onEnter, () => {
                        heard++;
                        stopScene(store, 'Level');
                    });
                }
            })();
            // Two walkers, so the step that ends the scene still has an overlap left to report.
            for (const x of [-1, 1]) {
                useSpawn(function Walker() {
                    useTransform({ x, y: 6 });
                    createMesh({ geometry: useCubeGeometry(), tint });
                    usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } });
                })();
            }
            return createScene();
        });

        await run(root, 240);

        expect(heard).toBe(1);
    });
});

describe('a walking character', () => {
    it('stands on the ground instead of falling through it', async () => {
        const { store } = createTestGame();
        let player: ReturnType<typeof useCharacterBody> = null;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor)();
            useSpawn(function Player() {
                useTransform({ y: 3 });
                createMesh({ geometry: useUvSphereGeometry({ radius: 0.35 }), tint });
                player = useCharacterBody({ radius: 0.35, height: 1.8, offset: [0, 0.9, 0] });
            })();
            return createScene();
        });
        const box = root.children[1];

        await run(root, 180);

        expect(player).not.toBeNull();
        expect(player!.isGrounded).toBe(true);
        // Its feet on the floor: the capsule's centre is 0.9 above the object's origin, so the
        // origin lands at nothing.
        expect(box.transform!.y).toBeCloseTo(0, 1);
    });

    it('walks where it is told, every frame, and is stopped by a wall', async () => {
        const { store } = createTestGame();
        let player: ReturnType<typeof useCharacterBody> = null;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor)();
            useSpawn(function Wall() {
                useTransform({ x: 4, y: 1 });
                createMesh({ geometry: useCubeGeometry(), tint });
                usePhysicsBody3d({ body: 'static', collider: { shape: 'box', size: [1, 4, 8] } });
            })();
            useSpawn(function Player() {
                useTransform({ y: 1 });
                createMesh({ geometry: useUvSphereGeometry({ radius: 0.35 }), tint });
                player = useCharacterBody({ radius: 0.35, height: 1.8, offset: [0, 0.9, 0] });
            })();
            return createScene();
        });
        const box = root.children[2];

        await loadBox3D();
        await new Promise((resolve) => setTimeout(resolve, 0));
        // Re-asserted every frame, because the solver clips what it could not honour: that is the
        // contract of `velocity` and the reason it is a mutable object rather than a setter.
        for (let i = 0; i < 300; i++) {
            player!.velocity.x = 4;
            runHookUpdates(root, FRAME);
        }

        // It got going, and then the wall at x = 4 stopped it short of its own radius past 3.5.
        expect(box.transform!.x).toBeGreaterThan(1);
        expect(box.transform!.x).toBeLessThan(3.5);
    });
});

/**
 * The shapes built from a model's own triangles, and the ray. All three hand box3d raw numbers
 * through calls it types loosely, so a change in what it expects (box3d 0.1 moved every vector to
 * `[x, y, z]`) would compile and only fail here.
 */
describe('a collider made of triangles, and a ray', () => {
    it('settles a convex hull on the floor, the same as a box of its size', async () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor)();
            useSpawn(function Rock() {
                useTransform({ y: 4 });
                createMesh({ geometry: useCubeGeometry(), tint });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'hull', geometry: 'cube:1:1:1' } });
            })();
            return createScene();
        });
        const rock = root.children[1];

        await run(root, 300);
        expect(rock.transform!.y).toBeCloseTo(0.5, 1);
    });

    it('stops a falling box on a floor made of a mesh', async () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(function Ground() {
                useTransform({ y: -0.5, scaleX: 20, scaleZ: 20 });
                createMesh({ geometry: useCubeGeometry(), tint });
                usePhysicsBody3d({ body: 'static', collider: { shape: 'mesh', geometry: 'cube:1:1:1' } });
            })();
            useSpawn(function Crate() {
                useTransform({ y: 4 });
                createMesh({ geometry: useCubeGeometry(), tint });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } });
            })();
            return createScene();
        });
        const crate = root.children[1];

        await run(root, 300);
        expect(crate.transform!.y).toBeCloseTo(0.5, 1);
    });

    it('casts a ray down onto the floor and says where and which way it faces', async () => {
        const { store } = createTestGame();
        // Asked for inside the scene, the only place a game is active to answer.
        let world: ReturnType<typeof getPhysicsWorld3d> = null;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor)();
            world = getPhysicsWorld3d();
            return createScene();
        });

        await run(root, 2);
        const hit = world!.raycast({ x: 1, y: 5, z: -2 }, { x: 0, y: -1, z: 0 });
        expect(hit).not.toBeNull();
        expect(hit!.point.y).toBeCloseTo(0, 3);
        expect(hit!.point.x).toBeCloseTo(1, 3);
        expect(hit!.normal.y).toBeCloseTo(1, 3);
        expect(hit!.distance).toBeCloseTo(5, 3);
    });
});

/**
 * Frames as the game runs them: the updates, then the sweep that finishes what `destroy` queued.
 */
const runFrames = async (store: TRuntimeStore, root: TGameObject, frames: number): Promise<void> => {
    await loadBox3D();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < frames; i++) {
        runHookUpdates(root, FRAME);
        flushDestroyed(store);
    }
};

/**
 * A destroyed object used to keep its body, an invisible wall where it used to be. The handle had a
 * `destroy()` of its own, but destroying the object never called it.
 */
describe('a destroyed object', () => {
    it('takes its body with it, so nothing collides with where it used to be', async () => {
        const { store } = createTestGame();
        let floor!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(function DestroyableFloor() {
                Floor();
                floor = useSelf();
            })();
            useSpawn(function Crate() {
                useTransform({ y: 3 });
                createMesh({ geometry: useCubeGeometry(), tint });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } });
            })();
            return createScene();
        });
        const crate = root.children[1];

        await runFrames(store, root, 180);
        expect(crate.transform!.y).toBeCloseTo(0.5, 1);

        destroy(floor);
        await runFrames(store, root, 60);

        expect(crate.transform!.y).toBeLessThan(-2);
    });
});

/**
 * A body moved to another layer while the game runs.
 */
describe('a body changed at runtime', () => {
    it('stops colliding with a layer it has left, and the record says so', async () => {
        const { store } = createTestGame();
        let crate!: TGameObject;
        let body!: TPhysicsBodyHandle3d;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(Floor)();
            useSpawn(function Crate() {
                useTransform({ y: 3 });
                createMesh({ geometry: useCubeGeometry(), tint });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } });
                crate = useSelf();
                body = getPhysicsWorld3d()!.bodyOf(crate)!;
            })();
            return createScene();
        });

        await runFrames(store, root, 180);
        expect(crate.transform!.y).toBeCloseTo(0.5, 1);

        // Layer 1, meeting only layer 1: the floor is on layer 0.
        body.setLayers(1, 1 << 1);
        await runFrames(store, root, 60);

        expect(crate.transform!.y).toBeLessThan(-2);
        expect(crate.physics).toMatchObject({ layer: 1, collidesWith: 1 << 1 });
    });
});
