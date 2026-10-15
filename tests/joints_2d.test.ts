import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { registerPhysicsProvider } from '../src/physics';
import { getPhysicsWorld2d, rapier2dProvider } from '../src/physics/rapier2d/provider';
import { loadRapier2D } from '../src/physics/rapier2d/load_rapier';
import { useJoint2d } from '../src/physics/rapier2d/use_joint_2d';
import { useCharacterBody2d } from '../src/physics/rapier2d/use_character_body_2d';
import { createTestGame, startTestScene } from './helpers/test_game';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { runMoves } from '../src/game/loop/runHookUpdates';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { usePhysicsBody2d, usePhysicsWorld2d } from '../src/hooks/physics';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useUpdate } from '../src/hooks/loop/use_update';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TJointHandle2d } from '../src/physics/rapier2d/t_joint_2d';
import type { TCharacterBody2d } from '../src/physics/character/t_character_body_2d';
import type { TBox } from '../src/box';
import type { TRuntimeStore } from '../src/store';

/**
 * Bodies joined together, or to a point of the world: a pendulum, a bridge of planks, a rope, a
 * spring, a rail, a weld, a motor. Each needs Rapier to have run, so each runs it.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const FRAME = 1 / 60;

beforeAll(async () => {
    await loadRapier2D();
});
beforeEach(() => {
    registerPhysicsProvider(rapier2dProvider);
});
afterEach(() => {
    registerPhysicsProvider(null);
});

/**
 * A dynamic box of a size at a point, with whatever its first frame needs: a speed.
 */
const Block = (x: number, y: number, width = 16, height = 16, vx = 0, vy = 0) => {
    const sprite = createSprite({ width, height, tint, transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 } });
    usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width, height } });
    if (vx !== 0 || vy !== 0) getPhysicsWorld2d()?.bodyOf(useSelf())?.setLinearVelocity(vx, vy);
    return sprite;
};

/**
 * Runs frames once the WebAssembly has landed: the world's step, and the characters' move.
 */
const run = async (store: TRuntimeStore, root: TBox, frames: number): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < frames; i++) {
        const moving: TBox[] = [];
        runHookUpdates(root, FRAME, undefined, undefined, undefined, moving);
        runMoves(moving, FRAME, root.time);
        flushDestroyed(store);
    }
};

const spriteOf = (object: TGameObject): TSprite => object.drawables[0] as TSprite;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('a hinge', () => {
    it('swings a weight on its nail, always as far from it', async () => {
        const { store } = createTestGame();
        let ball!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            ball = useSpawn(Block)(160, 40, 8, 8);
            useJoint2d(ball, null, { type: 'hinge', at: { x: 100, y: 40 } });
            return createScene();
        });

        await run(store, root, 30);
        const at = spriteOf(ball).transform;
        expect(at.y).toBeGreaterThan(70);
        expect(distance(at, { x: 100, y: 40 })).toBeCloseTo(60, 0);
    });

    it('turns as fast as its motor drives it', async () => {
        const { store } = createTestGame();
        let bar!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 0 } });
            bar = useSpawn(Block)(100, 100, 60, 6);
            useJoint2d(bar, null, { type: 'hinge', at: { x: 100, y: 100 }, motor: { speed: 2, strength: 10 } });
            return createScene();
        });

        await run(store, root, 60);
        // Added up a frame at a time, so going round past half a turn is not a jump back.
        let turned = 0;
        let last = spriteOf(bar).transform.rotation;
        for (let i = 0; i < 60; i++) {
            await run(store, root, 1);
            const now = spriteOf(bar).transform.rotation;
            turned += Math.atan2(Math.sin(now - last), Math.cos(now - last));
            last = now;
        }

        expect(turned).toBeCloseTo(2, 1);
    });

    it('keeps a door within its limits', async () => {
        const { store } = createTestGame();
        let door!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            // Hinged at its left end, so gravity swings it down until the limit holds it.
            door = useSpawn(Block)(130, 100, 60, 6);
            useJoint2d(door, null, { type: 'hinge', at: { x: 100, y: 100 }, limits: [-0.3, 0.3] });
            return createScene();
        });

        await run(store, root, 120);

        expect(Math.abs(spriteOf(door).transform.rotation)).toBeLessThan(0.35);
        expect(Math.abs(spriteOf(door).transform.rotation)).toBeGreaterThan(0.2);
    });
});

/**
 * A bridge of eight planks from 64 to 192 at y 120, pinned to the world at both ends.
 */
const bridge = () => {
    const spawnPlank = useSpawn(Block);
    const planks: TGameObject[] = [];
    for (let i = 0; i < 8; i++) planks.push(spawnPlank(72 + i * 16, 120, 16, 4));
    useJoint2d(planks[0], null, { type: 'hinge', at: { x: 64, y: 120 } });
    for (let i = 1; i < planks.length; i++) {
        useJoint2d(planks[i - 1], planks[i], { type: 'hinge', at: { x: 64 + i * 16, y: 120 } });
    }
    useJoint2d(planks[7], null, { type: 'hinge', at: { x: 192, y: 120 } });
    return planks;
};

describe('a bridge of planks', () => {
    it('hangs between its two ends and holds a crate dropped on it', async () => {
        const { store } = createTestGame();
        let crate!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            bridge();
            crate = useSpawn(Block)(128, 80);
            return createScene();
        });

        await run(store, root, 180);

        // Above the planks' sag, nowhere near the bottom of the world.
        expect(spriteOf(crate).transform.y).toBeLessThan(150);
        expect(spriteOf(crate).transform.y).toBeGreaterThan(100);
    });

    it('is walked on by a character', async () => {
        const { store } = createTestGame();
        let body!: TCharacterBody2d;
        let hero!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            bridge();
            hero = useSpawn(function Hero() {
                createSprite({ width: 12, height: 24, tint, transform: { x: 128, y: 80, rotation: 0, scaleX: 1, scaleY: 1 } });
                body = useCharacterBody2d({ width: 12, height: 24 });
            })();
            return createScene();
        });

        await run(store, root, 120);

        expect(body.onGround).toBe(true);
        expect(spriteOf(hero).transform.y).toBeLessThan(140);
    });
});

describe('a character standing on a bridge', () => {
    it('stays still on it, and the bridge under it, rather than the two bouncing off each other', async () => {
        const { store } = createTestGame();
        let hero!: TGameObject;
        let planks!: TGameObject[];
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            planks = bridge();
            hero = useSpawn(function Hero() {
                createSprite({ width: 12, height: 22, tint, transform: { x: 128, y: 90, rotation: 0, scaleX: 1, scaleY: 1 } });
                useCharacterBody2d({ width: 12, height: 22 });
            })();
            return createScene();
        });

        await run(store, root, 300);
        const heroYs: number[] = [];
        const plankYs: number[] = [];
        for (let i = 0; i < 120; i++) {
            await run(store, root, 1);
            heroYs.push(spriteOf(hero).transform.y);
            plankYs.push(spriteOf(planks[4]).transform.y);
        }
        const range = (values: number[]) => Math.max(...values) - Math.min(...values);

        // Under a pixel: still, to the eye.
        expect(range(heroYs)).toBeLessThan(1);
        expect(range(plankYs)).toBeLessThan(1);
    });
});

describe('a character that walks onto a bridge and stops', () => {
    it('leaves it still, the way a bridge with a little friction in its hinges settles', async () => {
        // A bridge between two banks that hangs a little in the middle, as the example builds it, its
        // ends pinned two pixels off the banks so they do not rub against them.
        const hingeAt = (i: number, n: number) => {
            const t = i / n;
            return { x: 98 + t * 140, y: 226 + 24 * t * (1 - t) };
        };
        const { store } = createTestGame();
        const planks: TGameObject[] = [];
        let walking = false;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            const bank = useSpawn((x: number) => {
                createSprite({ width: 96, height: 80, tint, transform: { x, y: 264, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 96, height: 80 } });
            });
            bank(48);
            bank(288);
            const n = 9;
            const spawnPlank = useSpawn((a: { x: number; y: number }, b: { x: number; y: number }) => {
                const length = Math.hypot(b.x - a.x, b.y - a.y);
                createSprite({ width: length, height: 4, tint, transform: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, rotation: Math.atan2(b.y - a.y, b.x - a.x), scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: length, height: 4 }, density: 2, friction: 1 });
            });
            for (let i = 0; i < n; i++) planks.push(spawnPlank(hingeAt(i, n), hingeAt(i + 1, n)));
            useJoint2d(planks[0], null, { type: 'hinge', at: hingeAt(0, n), friction: 2 });
            for (let i = 1; i < n; i++) useJoint2d(planks[i - 1], planks[i], { type: 'hinge', at: hingeAt(i, n), friction: 2 });
            useJoint2d(planks[n - 1], null, { type: 'hinge', at: hingeAt(n, n), friction: 2 });
            useSpawn(function Hero() {
                createSprite({ width: 24, height: 24, tint, transform: { x: 40, y: 200, rotation: 0, scaleX: 1, scaleY: 1 } });
                const body = useCharacterBody2d({ width: 12, height: 22, offset: [0, 1] });
                useUpdate(() => { body.velocity.x = walking ? 100 : 0; });
            })();
            return createScene();
        });

        // A second standing on the bank; then onto the bridge, a little short of its middle, and stop,
        // and give it time to settle.
        await run(store, root, 60);
        walking = true;
        await run(store, root, 69);
        walking = false;
        await run(store, root, 360);
        const first = planks.map((plank) => ({ ...spriteOf(plank).transform }));
        let moved = 0;
        for (let k = 0; k < 60; k++) {
            await run(store, root, 1);
            planks.forEach((plank, i) => {
                const at = spriteOf(plank).transform;
                // How far its ends move: its turn over half its length, and its rise and fall.
                moved = Math.max(moved, Math.abs(at.rotation - first[i].rotation) * 8 + Math.abs(at.y - first[i].y));
            });
        }

        // A fraction of a pixel no edge shows.
        expect(moved).toBeLessThan(0.08);
    });
});

describe('a bridge with friction in its hinges, broken in the middle', () => {
    it('hangs still from both banks, against their walls', async () => {
        const hingeAt = (i: number, n: number) => {
            const t = i / n;
            return { x: 98 + t * 140, y: 226 + 24 * t * (1 - t) };
        };
        const { store } = createTestGame();
        const planks: TGameObject[] = [];
        const joints: TJointHandle2d[] = [];
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            const bank = useSpawn((x: number) => {
                createSprite({ width: 96, height: 160, tint, transform: { x, y: 304, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 96, height: 160 } });
            });
            bank(48);
            bank(288);
            const n = 9;
            const spawnPlank = useSpawn((a: { x: number; y: number }, b: { x: number; y: number }) => {
                const length = Math.hypot(b.x - a.x, b.y - a.y);
                createSprite({ width: length, height: 4, tint, transform: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, rotation: Math.atan2(b.y - a.y, b.x - a.x), scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: length, height: 4 }, density: 2, friction: 1 });
            });
            for (let i = 0; i < n; i++) planks.push(spawnPlank(hingeAt(i, n), hingeAt(i + 1, n)));
            joints.push(useJoint2d(planks[0], null, { type: 'hinge', at: hingeAt(0, n), friction: 2 }));
            for (let i = 1; i < n; i++) joints.push(useJoint2d(planks[i - 1], planks[i], { type: 'hinge', at: hingeAt(i, n), friction: 2 }));
            joints.push(useJoint2d(planks[n - 1], null, { type: 'hinge', at: hingeAt(n, n), friction: 2 }));
            return createScene();
        });

        await run(store, root, 120);
        joints[5].destroy();
        // Ten seconds to fall, swing and come to rest against the banks.
        await run(store, root, 600);
        const first = planks.map((plank) => ({ ...spriteOf(plank).transform }));
        let moved = 0;
        for (let k = 0; k < 120; k++) {
            await run(store, root, 1);
            planks.forEach((plank, i) => {
                const at = spriteOf(plank).transform;
                moved = Math.max(moved, Math.abs(at.rotation - first[i].rotation) * 8 + Math.abs(at.x - first[i].x) + Math.abs(at.y - first[i].y));
            });
        }

        // The friction slows the hinges where they are now, far below where they were laid: measured
        // from where they were, it overshot, and the planks shook against the walls for ever.
        expect(moved).toBeLessThan(0.05);
    });
});

describe('a character\'s weight', () => {
    const sag = async (withHero: boolean) => {
        const { store } = createTestGame();
        let planks!: TGameObject[];
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            planks = bridge();
            if (withHero) {
                useSpawn(function Hero() {
                    createSprite({ width: 12, height: 22, tint, transform: { x: 128, y: 90, rotation: 0, scaleX: 1, scaleY: 1 } });
                    useCharacterBody2d({ width: 12, height: 22 });
                })();
            }
            return createScene();
        });
        await run(store, root, 300);
        return spriteOf(planks[4]).transform.y;
    };

    it('bends the bridge it stands on further than the bridge hangs alone', async () => {
        expect(await sag(true)).toBeGreaterThan((await sag(false)) + 0.5);
    });
});

describe('friction on a hinge', () => {
    const swing = async (friction: number | undefined) => {
        const { store } = createTestGame();
        let bob!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            bob = useSpawn(Block)(160, 40, 8, 8);
            useJoint2d(bob, null, friction === undefined ? { type: 'hinge', at: { x: 100, y: 40 } } : { type: 'hinge', at: { x: 100, y: 40 }, friction });
            return createScene();
        });
        // Three seconds of swinging, then two of looking.
        await run(store, root, 180);
        const xs: number[] = [];
        for (let i = 0; i < 120; i++) {
            await run(store, root, 1);
            xs.push(spriteOf(bob).transform.x);
        }
        return Math.max(...xs) - Math.min(...xs);
    };

    it('lets a pendulum come to rest, sooner the more there is', async () => {
        const some = await swing(1);
        const more = await swing(5);
        expect(more).toBeLessThan(1);
        expect(some).toBeGreaterThan(more);
        expect(some).toBeLessThan(60);
    });

    it('is nothing by default: a pendulum swings on', async () => {
        expect(await swing(undefined)).toBeGreaterThan(50);
    });
});

describe('a rope', () => {
    it('lets a weight come no further than its length, and closer freely', async () => {
        const { store } = createTestGame();
        let ball!: TGameObject;
        let longest = 0;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            ball = useSpawn(Block)(100, 70, 8, 8);
            useJoint2d(ball, null, { type: 'rope', length: 50, atB: { x: 100, y: 40 } });
            return createScene();
        });

        await new Promise((resolve) => setTimeout(resolve, 0));
        for (let i = 0; i < 90; i++) {
            await run(store, root, 1);
            longest = Math.max(longest, distance(spriteOf(ball).transform, { x: 100, y: 40 }));
        }

        expect(longest).toBeLessThan(51.5);
        expect(distance(spriteOf(ball).transform, { x: 100, y: 40 })).toBeCloseTo(50, 0);
    });

    it('is not made to the world without the point it is tied to, and says so', async () => {
        const warn: string[] = [];
        const original = console.warn;
        console.warn = (message: string) => { warn.push(message); };
        try {
            const { store } = createTestGame();
            const root = startTestScene(store, 'Level', () => {
                usePhysicsWorld2d();
                useJoint2d(useSpawn(Block)(100, 70), null, { type: 'rope', length: 50 });
                return createScene();
            });
            await run(store, root, 2);
        } finally {
            console.warn = original;
        }
        expect(warn.some((message) => message.includes('needs `atB`'))).toBe(true);
    });
});

describe('a spring', () => {
    it('bounces a weight about where it holds it, and settles', async () => {
        const { store } = createTestGame();
        let weight!: TGameObject;
        const ys: number[] = [];
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            // Pulled 40 past its length of 40 to begin with.
            weight = useSpawn(Block)(100, 120);
            useJoint2d(weight, null, { type: 'spring', length: 40, frequency: 3, damping: 0.2, atB: { x: 100, y: 40 } });
            return createScene();
        });

        await new Promise((resolve) => setTimeout(resolve, 0));
        for (let i = 0; i < 240; i++) {
            await run(store, root, 1);
            ys.push(spriteOf(weight).transform.y);
        }

        // It bounces back past its length, and comes to rest where gravity stretches it: by g / ω², which
        // at three bounces a second is 900 / (2π·3)², two and a half pixels, whatever the weight.
        const early = ys.slice(0, 60);
        expect(Math.min(...early)).toBeLessThan(80);
        const late = ys.slice(-30);
        expect(Math.max(...late) - Math.min(...late)).toBeLessThan(1);
        expect(late[late.length - 1]).toBeCloseTo(80 + 900 / (2 * Math.PI * 3) ** 2, 0);
    });
});

describe('a spring, heavier', () => {
    it('rests where a light weight rests: a frequency, not a force', async () => {
        const { store } = createTestGame();
        let heavy!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            heavy = useSpawn(Block)(100, 80, 32, 32);
            useJoint2d(heavy, null, { type: 'spring', length: 40, frequency: 3, damping: 1, atB: { x: 100, y: 40 } });
            return createScene();
        });

        await run(store, root, 240);

        expect(spriteOf(heavy).transform.y).toBeCloseTo(80 + 900 / (2 * Math.PI * 3) ** 2, 0);
    });
});

describe('a slider', () => {
    it('keeps a platform on its rail against gravity, within its limits', async () => {
        const { store } = createTestGame();
        let platform!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            platform = useSpawn(Block)(100, 100, 32, 8, 300, 0);
            useJoint2d(platform, null, { type: 'slider', axis: { x: 1, y: 0 }, limits: [-20, 20] });
            return createScene();
        });

        await run(store, root, 60);

        const at = spriteOf(platform).transform;
        expect(at.y).toBeCloseTo(100, 0);
        expect(at.x).toBeCloseTo(120, 0);
        expect(at.rotation).toBeCloseTo(0, 2);
    });
});

describe('a weld', () => {
    it('moves two bodies as one', async () => {
        const { store } = createTestGame();
        let left!: TGameObject;
        let right!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 0 } });
            left = useSpawn(Block)(100, 100, 16, 16, 120, 0);
            right = useSpawn(Block)(130, 100);
            useJoint2d(left, right, { type: 'weld' });
            return createScene();
        });

        await run(store, root, 60);

        const a = spriteOf(left).transform;
        const b = spriteOf(right).transform;
        expect(a.x).toBeGreaterThan(130);
        expect(b.x - a.x).toBeCloseTo(30, 0);
        expect(b.y - a.y).toBeCloseTo(0, 0);
    });
});

describe('two pieces joined that overlap', () => {
    const overlapping = async (collide: boolean | undefined) => {
        const { store } = createTestGame();
        let a!: TGameObject;
        let b!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 0 } });
            // Overlapping by half, on a rope long enough to let them part.
            a = useSpawn(Block)(100, 100, 20, 20);
            b = useSpawn(Block)(110, 100, 20, 20);
            useJoint2d(a, b, collide === undefined ? { type: 'rope', length: 80 } : { type: 'rope', length: 80, collide });
            return createScene();
        });
        await run(store, root, 60);
        return spriteOf(b).transform.x - spriteOf(a).transform.x;
    };

    it('stay as they were put, since joined bodies do not collide with each other', async () => {
        expect(await overlapping(undefined)).toBeCloseTo(10, 1);
    });

    it('push each other apart when the joint says they collide', async () => {
        expect(await overlapping(true)).toBeGreaterThan(11);
    });
});

describe('letting go', () => {
    it('drops a weight once its joint is destroyed', async () => {
        const { store } = createTestGame();
        let ball!: TGameObject;
        let joint!: TJointHandle2d;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            ball = useSpawn(Block)(100, 100, 8, 8);
            joint = useJoint2d(ball, null, { type: 'rope', length: 60, atB: { x: 100, y: 40 } });
            return createScene();
        });

        await run(store, root, 60);
        expect(spriteOf(ball).transform.y).toBeCloseTo(100, 0);

        joint.destroy();
        await run(store, root, 30);
        expect(spriteOf(ball).transform.y).toBeGreaterThan(130);
    });

    it('drops what hung from an object once that object is destroyed', async () => {
        const { store } = createTestGame();
        let anchor!: TGameObject;
        let ball!: TGameObject;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 900 } });
            anchor = useSpawn(function Hook() {
                createSprite({ width: 8, height: 8, tint, transform: { x: 100, y: 40, rotation: 0, scaleX: 1, scaleY: 1 } });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 8, height: 8 } });
            })();
            ball = useSpawn(Block)(100, 100, 8, 8);
            useJoint2d(ball, anchor, { type: 'rope', length: 60 });
            return createScene();
        });

        await run(store, root, 60);
        expect(spriteOf(ball).transform.y).toBeCloseTo(100, 0);

        destroy(anchor);
        await run(store, root, 30);
        expect(spriteOf(ball).transform.y).toBeGreaterThan(130);
    });
});
