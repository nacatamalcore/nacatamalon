import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { registerPhysicsProvider } from '../src/physics';
import { rapier2dProvider } from '../src/physics/rapier2d/provider';
import { loadRapier2D } from '../src/physics/rapier2d/load_rapier';
import { useSoftBody2d } from '../src/physics/rapier2d/use_soft_body_2d';
import { createTestGame, startTestScene } from './helpers/test_game';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createPolygon } from '../src/gameobjects/polygon';
import { usePhysicsBody2d, usePhysicsWorld2d } from '../src/hooks/physics';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { destroy } from '../src/destroy/destroy';
import { flushDestroyed } from '../src/destroy/flush_destroyed';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TSoftBody2d, TSoftBodyOptions2d } from '../src/physics/rapier2d/t_soft_body_2d';
import type { TPolygon } from '../src/gameobjects/polygon';
import type { TTransform3d } from '../src/gameobjects/types/t_transform_3d';
import type { TBox } from '../src/box';
import type { TRuntimeStore } from '../src/store';

/**
 * Bodies that squash and roll: a ring of corners held together by springs, in the scene's 2D world.
 */

const FRAME = 1 / 60;
const tint = { r: 1, g: 1, b: 1, a: 1 };

beforeAll(async () => {
    await loadRapier2D();
});
beforeEach(() => {
    registerPhysicsProvider(rapier2dProvider);
});
/**
 * Every game a test made, so its scene is stopped after it: the installed world is the last scene's
 * until that scene goes, and a test file after this one would find it.
 */
const made: TRuntimeStore[] = [];
afterEach(() => {
    for (const store of made.splice(0)) stopScene(store, 'Level');
    registerPhysicsProvider(null);
});

const run = async (store: TRuntimeStore, root: TBox, frames: number, each?: () => void): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < frames; i++) {
        each?.();
        runHookUpdates(root, FRAME);
        flushDestroyed(store);
    }
};

/**
 * A floor 400 wide whose top is at y = 190, turned by `angle`.
 */
const Floor = (angle = 0) => {
    createSprite({ width: 400, height: 20, tint, transform: { x: 160, y: 200, rotation: angle, scaleX: 1, scaleY: 1 } });
    usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 400, height: 20 }, friction: 1 });
};

/**
 * Area enclosed by an outline.
 */
const areaOf = (outline: ReadonlyArray<{ x: number; y: number }>): number => {
    let sum = 0;
    for (let i = 0; i < outline.length; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
};

const level = (options: TSoftBodyOptions2d, start = { x: 160, y: 100 }, floorAngle = 0) => {
    const { store } = createTestGame();
    made.push(store);
    let blob!: TSoftBody2d;
    let place!: TTransform3d;
    let object!: TGameObject;
    const root = startTestScene(store, 'Level', () => {
        usePhysicsWorld2d();
        useSpawn(Floor)(floorAngle);
        object = useSpawn(function Blob() {
            place = useTransform({ x: start.x, y: start.y });
            blob = useSoftBody2d(options);
        })();
        return createScene();
    });
    return { store, root, blob: () => blob, place: () => place, object: () => object };
};

describe('useSoftBody2d', () => {
    it('falls, lands on what is under it and settles, keeping most of its area', async () => {
        const { store, root, blob, place } = level({ shape: 'disk', radius: 20 });
        await run(store, root, 240);
        const outline = blob().outline;
        expect(outline.length).toBe(16);
        const bottom = Math.max(...outline.map((p) => place().y + p.y));
        // On the floor, not through it.
        expect(bottom).toBeGreaterThan(184);
        expect(bottom).toBeLessThan(191);
        // Squashed, a jelly, but not flat.
        const area = areaOf(outline);
        expect(area).toBeGreaterThan(Math.PI * 400 * 0.6);
        expect(area).toBeLessThan(Math.PI * 400 * 1.05);
        expect(Math.abs(blob().velocity.y)).toBeLessThan(5);
    });

    it('keeps its object at its middle, with its corners round it', async () => {
        const { store, root, blob } = level({ shape: 'disk', radius: 20 });
        await run(store, root, 1);
        const outline = blob().outline;
        const middle = outline.reduce((sum, p) => ({ x: sum.x + p.x / outline.length, y: sum.y + p.y / outline.length }), { x: 0, y: 0 });
        expect(Math.abs(middle.x)).toBeLessThan(0.01);
        expect(Math.abs(middle.y)).toBeLessThan(0.01);
        expect(Math.hypot(outline[0].x, outline[0].y)).toBeCloseTo(20, 0);
    });

    it('rolls down a slope', async () => {
        const { store, root, place } = level({ shape: 'disk', radius: 20, friction: 1 }, { x: 100, y: 110 }, 0.3);
        await run(store, root, 90);
        expect(place().x).toBeGreaterThan(140);
    });

    it('hangs in the air when pushed up exactly as hard as it falls', async () => {
        const hold = level({ shape: 'disk', radius: 20 }, { x: 160, y: 60 });
        await run(hold.store, hold.root, 60, () => hold.blob().push(0, -900));
        expect(Math.abs(hold.place().y - 60)).toBeLessThan(1);
        expect(Math.abs(hold.blob().velocity.y)).toBeLessThan(1);
    });

    it('is flatter the softer it is', async () => {
        const firm = level({ shape: 'disk', radius: 20, softness: 30 });
        const soft = level({ shape: 'disk', radius: 20, softness: 4 });
        await run(firm.store, firm.root, 180);
        await run(soft.store, soft.root, 180);
        const height = (outline: ReadonlyArray<{ y: number }>) => Math.max(...outline.map((p) => p.y)) - Math.min(...outline.map((p) => p.y));
        expect(height(soft.blob().outline)).toBeLessThan(height(firm.blob().outline) - 4);
    });

    it('hops when kicked, and is carried by a push asked for every frame', async () => {
        const { store, root, blob, place } = level({ shape: 'disk', radius: 20 });
        await run(store, root, 180);
        const resting = place().y;
        blob().kick(0, -300);
        await run(store, root, 8);
        expect(place().y).toBeLessThan(resting - 10);

        const pushed = level({ shape: 'disk', radius: 20 }, { x: 160, y: 100 });
        await run(pushed.store, pushed.root, 120);
        const startX = pushed.place().x;
        await run(pushed.store, pushed.root, 60, () => pushed.blob().push(400, 0));
        expect(pushed.place().x).toBeGreaterThan(startX + 20);
    });

    it('holds pinned corners where they start: a rope hung by one end', async () => {
        const { store, root, blob, place } = level({ shape: 'rope', to: { x: 60, y: 0 }, corners: 7, pinned: [0] }, { x: 100, y: 40 });
        await run(store, root, 120);
        const outline = blob().outline;
        const first = { x: place().x + outline[0].x, y: place().y + outline[0].y };
        const last = { x: place().x + outline[6].x, y: place().y + outline[6].y };
        expect(first.x).toBeCloseTo(100, 0);
        expect(first.y).toBeCloseTo(40, 0);
        // Fallen from where it was laid out, level, to hang below its end, about as long as it was.
        expect(last.y).toBeGreaterThan(70);
        expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThan(66);
        expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeGreaterThan(50);
    });

    it('moves the corners of the shape that draws it', async () => {
        const { store } = createTestGame();
        made.push(store);
        let polygon!: TPolygon;
        let blob!: TSoftBody2d;
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(Floor)();
            useSpawn(function Blob() {
                useTransform({ x: 160, y: 100 });
                const ring = Array.from({ length: 16 }, (_, i) => ({ x: Math.cos((i / 16) * Math.PI * 2) * 20, y: Math.sin((i / 16) * Math.PI * 2) * 20 }));
                polygon = createPolygon({ points: ring });
                blob = useSoftBody2d({ shape: 'disk', radius: 20, polygon });
            })();
            return createScene();
        });
        await run(store, root, 120);
        expect(polygon.points.length).toBe(16);
        expect(polygon.points).toEqual(blob.outline.map((p) => ({ x: p.x, y: p.y })));
        // Landed, so squashed: not the circle it was drawn as.
        expect(Math.abs(Math.hypot(polygon.points[4].x, polygon.points[4].y) - 20)).toBeGreaterThan(0.5);
    });

    it('leaves the world with its object', async () => {
        const { store, root, object, blob } = level({ shape: 'disk', radius: 20 });
        await run(store, root, 10);
        destroy(object());
        await run(store, root, 1);
        const before = blob().outline.map((p) => ({ ...p }));
        await run(store, root, 20);
        expect(blob().outline).toEqual(before);
    });

    it('keeps its shape under another one landing on it, rather than folding inside out', async () => {
        const stack = async (keepShape: boolean): Promise<number[]> => {
            const { store } = createTestGame();
            made.push(store);
            const blobs: TSoftBody2d[] = [];
            const root = startTestScene(store, 'Level', () => {
                usePhysicsWorld2d();
                useSpawn(Floor)();
                const spawn = useSpawn(function Blob(x: number, y: number) {
                    useTransform({ x, y });
                    blobs.push(useSoftBody2d({ shape: 'disk', radius: 20, keepShape }));
                });
                for (let i = 0; i < 4; i++) spawn(160 + (i % 2) * 6, 160 - i * 44);
                return createScene();
            });
            await run(store, root, 300);
            return blobs.map((blob) => areaOf(blob.outline) / (Math.PI * 400));
        };
        const kept = await stack(true);
        expect(Math.min(...kept)).toBeGreaterThan(0.6);
        // Without it, the bottom ones give way.
        const slumped = await stack(false);
        expect(Math.min(...slumped)).toBeLessThan(Math.min(...kept));
    });

    it('refuses a polygon of fewer than three corners', () => {
        const { store } = createTestGame();
        expect(() => startTestScene(store, 'Level', () => {
            useSpawn(function Blob() {
                useTransform({ x: 0, y: 0 });
                useSoftBody2d({ shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
            })();
            return createScene();
        })).toThrow('at least three corners');
    });
});
