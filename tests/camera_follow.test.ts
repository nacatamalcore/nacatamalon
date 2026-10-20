import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useCameraFollow } from '../src/hooks/camera/use_camera_follow';
import { createFakeCanvas, createTestGame } from './helpers/test_game';
import { createTilemap } from '../src/gameobjects/tilemap/create_tilemap';
import { whenLoaded } from '../src/loaders';
import { serveTilemap } from './helpers/test_tilemap';
import type { TTilemap } from '../src/gameobjects/tilemap/types/t_tilemap';
import type { TCameraFollow, TCameraFollowOptions } from '../src/hooks/camera/use_camera_follow';
import type { TTransform3d } from '../src/gameobjects/types/t_transform_3d';

/**
 * A platformer's camera: centred on its target, a dead zone it moves inside freely, the level's edges
 * it never shows past, a glide, whole pixels, and a shake that dies away. On a screen 320 by 224.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const W = 320;
const H = 224;

/**
 * A scene with a hero at a point, moved by `move` every frame, and a camera following it.
 */
const level = (options: TCameraFollowOptions = {}, start = { x: 1000, y: 500 }, move: (at: TTransform3d) => void = () => {}, zoom = 1) => {
    const { store } = createTestGame({}, createFakeCanvas(W, H));
    const ctx = createFrameContext();
    let follow!: TCameraFollow;
    let hero!: TTransform3d;
    registerScene(store, 'Level', () => {
        useCamera2d({ zoom });
        const object = useSpawn(function Hero() {
            hero = useTransform({ x: start.x, y: start.y });
            createSprite({ width: 12, height: 24, tint: { r: 1, g: 1, b: 1, a: 1 }, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
            useUpdate(() => move(hero));
        })();
        follow = useCameraFollow(object, options);
        return createScene();
    });
    startScene(store, 'Level');
    let now = 0;
    const frames = (count = 1, ms = 1000 / 60): void => {
        for (let i = 0; i < count; i++) {
            const prev = now;
            now += ms;
            tick(store, ctx, now, prev);
        }
    };
    return { follow, frames, hero: () => hero, camera: () => follow.camera.transform };
};

describe('useCameraFollow', () => {
    it('puts its target in the middle of the screen', () => {
        const { frames, camera } = level();
        frames();
        expect([camera().x, camera().y]).toEqual([1000 - W / 2, 500 - H / 2]);
    });

    it('reads where the target ended up this frame, not the one before', () => {
        const { frames, camera } = level({}, { x: 1000, y: 500 }, (at) => { at.x += 3; });
        frames(10);
        expect(camera().x).toBe(1030 - W / 2);
    });

    it('lets the target move inside the dead zone, and follows only as far as it pushes past it', () => {
        let dx = 0;
        const { frames, camera } = level({ deadzone: { width: 40, height: 40 } }, { x: 1000, y: 500 }, (at) => { at.x += dx; });
        frames();
        const still = camera().x;
        dx = 5;
        frames(4);
        // Twenty to the right, the edge of a zone forty wide: not yet.
        expect(camera().x).toBe(still);
        frames(2);
        // Ten past it: the camera has come ten.
        expect(camera().x).toBe(still + 10);
    });

    it('never shows past the edges of the level, and centres a level smaller than the screen', () => {
        const near = level({ bounds: { x: 0, y: 0, width: 2000, height: 1000 } }, { x: 50, y: 980 });
        near.frames();
        expect([near.camera().x, near.camera().y]).toEqual([0, 1000 - H]);

        const small = level({ bounds: { x: 100, y: 100, width: 200, height: 100 } }, { x: 0, y: 0 });
        small.frames();
        expect([small.camera().x, small.camera().y]).toEqual([200 - W / 2, 150 - H / 2]);
    });

    it('measures the screen at its zoom: twice as big shows half as much', () => {
        const { frames, camera } = level({ bounds: { x: 0, y: 0, width: 2000, height: 1000 } }, { x: 50, y: 500 }, () => {}, 2);
        frames();
        expect([camera().x, camera().y]).toEqual([0, 500 - H / 4]);
    });

    it('looks ahead by its lead', () => {
        const { frames, camera } = level({ lead: { x: 24, y: -8 } });
        frames();
        expect([camera().x, camera().y]).toEqual([1024 - W / 2, 492 - H / 2]);
    });

    it('glides when smooth, the same at any refresh rate, and arrives', () => {
        const glide = (ms: number) => {
            let jump = false;
            const run = level({ smooth: 0.2, round: false }, { x: 1000, y: 500 }, (at) => { if (jump) at.x = 1100; });
            run.frames();
            jump = true;
            run.frames(Math.round(250 / ms), ms);
            return run.camera().x;
        };
        const at60 = glide(1000 / 60);
        const at144 = glide(1000 / 144);
        // A quarter of a second into a glide of a fifth: most of the way, at either rate.
        expect(at60).toBeGreaterThan(1000 - W / 2);
        expect(at60).toBeLessThan(1100 - W / 2);
        expect(at144).toBeCloseTo(at60, 0);
    });

    it('stays on whole pixels unless told not to', () => {
        const rounded = level({}, { x: 1000.4, y: 500.6 });
        rounded.frames();
        expect([rounded.camera().x, rounded.camera().y]).toEqual([840, 389]);

        const exact = level({ round: false }, { x: 1000.4, y: 500.6 });
        exact.frames();
        expect(exact.camera().x).toBeCloseTo(840.4, 5);
    });

    it('shakes no further than it was told, dies away, and leaves the camera where it was', () => {
        const { follow, frames, camera } = level();
        frames();
        const still = { x: camera().x, y: camera().y };
        follow.shake(4, 0.25);
        let furthest = 0;
        let moved = false;
        for (let i = 0; i < 10; i++) {
            frames();
            furthest = Math.max(furthest, Math.abs(camera().x - still.x), Math.abs(camera().y - still.y));
            if (camera().x !== still.x || camera().y !== still.y) moved = true;
        }
        expect(moved).toBe(true);
        expect(furthest).toBeLessThanOrEqual(4);
        frames(10);
        expect([camera().x, camera().y]).toEqual([still.x, still.y]);
    });

    it('jumps to its target at once when snapped, gliding or not', () => {
        let jump = false;
        const { follow, frames, camera } = level({ smooth: 1 }, { x: 1000, y: 500 }, (at) => { if (jump) at.x = 3000; });
        frames();
        jump = true;
        follow.snap();
        frames();
        expect(camera().x).toBe(3000 - W / 2);
    });

    it('follows something else when told, and holds still with nothing', () => {
        const { follow, frames, camera } = level();
        frames();
        follow.target = { x: 200, y: 100 };
        frames();
        expect([camera().x, camera().y]).toEqual([200 - W / 2, 100 - H / 2]);
        follow.target = null;
        frames();
        expect([camera().x, camera().y]).toEqual([200 - W / 2, 100 - H / 2]);
    });

    it('takes a map\'s edges as its bounds, wherever the map is placed, once it has loaded', async () => {
        // A hundred cells of 8 across and forty down: 800 by 320, placed at 50, 20.
        const served = serveTilemap({
            format: 1, kind: 'tilemap', atlas: 'tiles.atlas', cell: 8, width: 100, height: 40,
            tiles: { 1: { frame: 0, solid: true } },
            layers: [{ name: 'ground', order: 0, data: new Array(4000).fill(0) }],
        });
        try {
            const { store } = createTestGame({}, createFakeCanvas(W, H));
            const ctx = createFrameContext();
            let follow!: TCameraFollow;
            let map!: TTilemap;
            let hero!: TTransform3d;
            registerScene(store, 'Level', () => {
                map = createTilemap({ src: '/maps/level.tilemap', transform: { x: 50, y: 20 } });
                const object = useSpawn(function Hero() { hero = useTransform({ x: 60, y: 30 }); })();
                follow = useCameraFollow(object, { bounds: map });
                return createScene();
            });
            startScene(store, 'Level');
            await whenLoaded(map);
            let now = 0;
            const frame = () => { const prev = now; now += 1000 / 60; tick(store, ctx, now, prev); };
            frame();
            expect([follow.camera.transform.x, follow.camera.transform.y]).toEqual([50, 20]);

            hero.x = 845;
            hero.y = 335;
            frame();
            expect([follow.camera.transform.x, follow.camera.transform.y]).toEqual([850 - W, 340 - H]);
        } finally {
            served.restore();
        }
    });
});

describe('useCameraFollow with rooms', () => {
    const A = { x: 0, y: 0, width: W, height: H };
    const B = { x: W, y: 0, width: W, height: H };

    it('keeps the camera inside the room the target is in', () => {
        const { frames, camera, follow } = level({ rooms: [A, B] }, { x: 300, y: 100 });
        frames();
        expect([camera().x, camera().y]).toEqual([0, 0]);
        expect(follow.room).toEqual(A);
        expect(follow.scrolling).toBe(false);
    });

    it('scrolls across to the next room when the target walks into it, over `scroll` seconds', () => {
        const entered: Array<[number, number | null]> = [];
        const { frames, camera, follow } = level(
            { rooms: [A, B], scroll: 0.5, onRoom: (room, from) => entered.push([room.x, from?.x ?? null]) },
            { x: 316, y: 100 },
            (at) => { at.x += 2; },
        );
        frames(2);
        expect(follow.room).toEqual(B);
        expect(follow.scrolling).toBe(true);
        expect(entered).toEqual([[0, null], [W, 0]]);
        const start = camera().x;
        frames(14);
        expect(camera().x).toBeGreaterThan(start);
        expect(camera().x).toBeLessThan(W);
        frames(20);
        expect(camera().x).toBe(W);
        expect(follow.scrolling).toBe(false);
    });

    it('cuts straight to the next room with `scroll: 0`', () => {
        const { frames, camera } = level({ rooms: [A, B], scroll: 0 }, { x: 318, y: 100 }, (at) => { at.x += 2; });
        frames(3);
        expect(camera().x).toBe(W);
    });

    it('stays in the room it was in while the target is between rooms', () => {
        let gap = false;
        const { frames, camera, follow } = level({ rooms: [A, { x: W + 64, y: 0, width: W, height: H }] }, { x: 300, y: 100 }, (at) => { if (gap) at.x = 340; });
        frames();
        gap = true;
        frames(5);
        expect(follow.room).toEqual(A);
        expect(camera().x).toBe(0);
    });

    it('lays a grid of equal rooms from one size', () => {
        const { frames, camera, follow } = level({ rooms: { width: W, height: H } }, { x: 700, y: 300 });
        frames();
        expect(follow.room).toEqual({ x: 2 * W, y: H, width: W, height: H });
        expect([camera().x, camera().y]).toEqual([2 * W, H]);
    });

    it('turns back from halfway through a scroll without jumping', () => {
        let dx = 2;
        const { frames, camera, follow } = level({ rooms: [A, B], scroll: 0.5 }, { x: 316, y: 100 }, (at) => { at.x += dx; });
        frames(10);
        const halfway = camera().x;
        dx = -40;
        frames();
        expect(follow.room).toEqual(A);
        expect(Math.abs(camera().x - halfway)).toBeLessThan(W / 10);
        dx = 0;
        frames(40);
        expect(camera().x).toBe(0);
    });
});

describe('useCameraFollow with a grid of rooms and bounds', () => {
    it('cuts the last room of a row to the level, so the camera never shows past it', () => {
        const bounds = { x: 0, y: 0, width: W * 2.5, height: H };
        const { frames, camera, follow } = level({ rooms: { width: W, height: H }, bounds, scroll: 0 }, { x: W * 2.2, y: 100 });
        frames();
        expect(follow.room).toEqual({ x: 2 * W, y: 0, width: W / 2, height: H });
        // The room is half a screen wide: the camera keeps to the level's edge rather than the room's.
        expect(camera().x + W).toBeLessThanOrEqual(bounds.width);
    });
});

describe('a camera made after the follow', () => {
    it('is the one it moves, whichever came first in the body', () => {
        const { store } = createTestGame({}, createFakeCanvas(W, H));
        const ctx = createFrameContext();
        let follow!: TCameraFollow;
        let camera!: ReturnType<typeof useCamera2d>;
        const warn = console.warn;
        const said: string[] = [];
        console.warn = (message: string) => { said.push(message); };
        try {
            registerScene(store, 'Level', () => {
                const hero = useSpawn(function Hero() {
                    useTransform({ x: 1000, y: 500 });
                })();
                follow = useCameraFollow(hero);
                // The camera of the scene, asked for after: zoomed, so it shows half as much.
                camera = useCamera2d({ zoom: 2 });
                return createScene();
            });
            startScene(store, 'Level');
            tick(store, ctx, 1000 / 60, 0);
        } finally {
            console.warn = warn;
        }

        expect(follow.camera).toBe(camera);
        // The hero in the middle of a screen 160 by 112 at that zoom.
        expect(camera.transform.x).toBe(1000 - W / 4);
        expect(camera.transform.y).toBe(500 - H / 4);
        expect(said.filter((message) => message.includes('already had a camera'))).toEqual([]);
    });
});
