import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { useHitbox } from '../src/hooks/hitbox';
import { useCapture } from '../src/hooks/capture';
import { cutAndScale, photoSize } from '../src/capture/photo_pixels';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { ITexture, TRenderPass } from '../src/render/interface';
import type { TCapture } from '../src/capture';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';

/**
 * A photo taken by the game (`useCapture`): the screen drawn once more, as the player sees it, cut to
 * a region, made smaller by whole pixels, with some boxes left out or alone, and what came out in it.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

/**
 * A game 320 × 180 whose renderer reads back a picture where every pixel says where it is: red its x,
 * green its y. So what a photo cut and scaled is plain to read.
 */
const studio = (body: (capture: () => TCapture) => void) => {
    const { store, renderer } = createTestGame({}, createFakeCanvas(320, 180));
    const sizes = new Map<ITexture, { width: number; height: number }>();
    renderer.createRenderTexture = (width, height) => {
        const texture: ITexture = { resourceType: 'texture' };
        sizes.set(texture, { width, height });
        return texture;
    };
    renderer.readTexture = async (texture) => {
        const { width, height } = sizes.get(texture)!;
        const data = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) data.set([x % 256, y % 256, 0, 255], (y * width + x) * 4);
        }
        return { width, height, data };
    };
    let capture!: TCapture;
    startTestScene(store, 'Level', () => {
        capture = useCapture();
        body(() => capture);
        return createScene();
    });
    const ctx = createFrameContext();
    let now = 0;
    const passes: TRenderPass[][] = [];
    const frame = (): void => {
        const prev = now;
        now += 16;
        tick(store, ctx, now, prev);
        passes.push([...ctx.passes]);
    };
    /** Frames run until the photo is developed. */
    const develop = async <T>(photo: Promise<T>): Promise<T> => {
        let done = false;
        void photo.then(() => { done = true; }, () => { done = true; });
        for (let i = 0; i < 10 && !done; i++) {
            frame();
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return photo;
    };
    return { store, capture: () => capture, develop, passes };
};

const pixel = (photo: { width: number; data: Uint8Array }, x: number, y: number) => [...photo.data.slice((y * photo.width + x) * 4, (y * photo.width + x) * 4 + 4)];

describe('cutting and scaling a photo', () => {
    const screen = { width: 8, height: 4, data: new Uint8Array(8 * 4 * 4).map((_, i) => (i % 4 === 0 ? (i / 4) % 8 : i % 4 === 1 ? Math.floor(i / 32) : 255)) };

    it('cuts a region, and makes it smaller by whole pixels, never blended', () => {
        const cut = cutAndScale(screen, { x: 2, y: 1, width: 4, height: 2 }, 4, 2);
        expect([pixel(cut, 0, 0), pixel(cut, 3, 1)]).toEqual([[2, 1, 255, 255], [5, 2, 255, 255]]);
        const half = cutAndScale(screen, { x: 0, y: 0, width: 8, height: 4 }, 4, 2);
        // Each pixel the one under its middle: 0.5 × 2 = 1, 1.5 × 2 = 3…
        expect([pixel(half, 0, 0)[0], pixel(half, 1, 0)[0], pixel(half, 3, 1)[1]]).toEqual([1, 3, 3]);
    });

    it('leaves what falls off the screen transparent', () => {
        const off = cutAndScale(screen, { x: 6, y: 0, width: 4, height: 1 }, 4, 1);
        expect(pixel(off, 1, 0)).toEqual([7, 0, 255, 255]);
        expect(pixel(off, 2, 0)).toEqual([0, 0, 0, 0]);
    });

    it('keeps the region\'s shape when only one side is given', () => {
        expect(photoSize({ x: 0, y: 0, width: 320, height: 180 }, 160)).toEqual({ width: 160, height: 90 });
        expect(photoSize({ x: 0, y: 0, width: 320, height: 180 }, undefined, 45)).toEqual({ width: 80, height: 45 });
        expect(photoSize({ x: 0, y: 0, width: 40, height: 20 })).toEqual({ width: 40, height: 20 });
    });
});

describe('useCapture', () => {
    it('is called in a scene\'s body', () => {
        expect(() => useCapture()).toThrow('[NacatamalOn] useCapture');
    });

    it('takes the screen as the player sees it, effects and all, unless asked without', async () => {
        const { capture, develop, passes } = studio(() => createSprite({ width: 10, height: 10 }));
        const photo = await develop(capture()());
        expect([photo.width, photo.height]).toEqual([320, 180]);
        expect(pixel(photo, 319, 179)).toEqual([319 % 256, 179, 0, 255]);
        const pass = passes.flat().find((p) => p.renderTarget !== undefined)!;
        expect(pass.postProcess).toBe(true);

        passes.length = 0;
        await develop(capture()({ effects: false }));
        expect(passes.flat().find((p) => p.renderTarget !== undefined)!.postProcess).toBe(false);
        // The screen keeps its own all along.
        expect(passes.flat().filter((p) => p.renderTarget === undefined).every((p) => p.postProcess === true)).toBe(true);
    });

    it('cuts a rectangle of the screen and makes it the size asked for', async () => {
        const { capture, develop } = studio(() => {});
        const photo = await develop(capture()({ region: { x: 100, y: 50, width: 40, height: 20 }, width: 20 }));
        expect([photo.width, photo.height]).toEqual([20, 10]);
        expect(pixel(photo, 0, 0)).toEqual([101, 51, 0, 255]);
    });

    it('leaves out boxes by name or by box, only in the photo, and keeps some alone on nothing', async () => {
        let hud!: TSprite;
        let bird!: TSprite;
        const { capture, develop, passes } = studio(() => {
            useSpawn(function Hud() {
                hud = createSprite({ width: 10, height: 10 });
            }, 'Hud')();
            bird = createSprite({ width: 10, height: 10, transform: { x: 50, y: 50 } });
        });
        await develop(capture()({ hide: ['Hud'] }));
        const photoPass = passes.flat().find((p) => p.renderTarget !== undefined)!;
        const screenPass = passes.flat().filter((p) => p.renderTarget === undefined).at(-1)!;
        expect(photoPass.drawables).not.toContain(hud);
        expect(photoPass.drawables).toContain(bird);
        expect(screenPass.drawables).toContain(hud);

        passes.length = 0;
        await develop(capture()({ only: [bird] }));
        const alone = passes.flat().find((p) => p.renderTarget !== undefined)!;
        expect(alone.drawables).toEqual([bird]);
        expect(alone.clearColor).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    });

    it('takes the part of the screen a box covers, through its scene\'s camera, hidden or empty', async () => {
        const { capture, develop } = studio(() => {
            useCamera2d({ x: 50, y: 0 });
            // A viewfinder never drawn: 40 × 20 about (150, 60) in the world, (100, 60) on the screen.
            createSprite({ width: 40, height: 20, transform: { x: 150, y: 60 }, visible: false });
            useSpawn(function Frame() {
                useTransform({ x: 150, y: 60 });
                useHitbox({ group: 'frame', width: 40, height: 20 });
            }, 'Frame')();
        });
        const byHitbox = await develop(capture()({ region: 'Frame' }));
        expect([byHitbox.width, byHitbox.height]).toEqual([40, 20]);
        expect(pixel(byHitbox, 0, 0)).toEqual([80, 50, 0, 255]);
    });

    it('says what came out in it, how much and where, most seen first', async () => {
        const { capture, develop } = studio(() => {
            useSpawn(function Bird() {
                useTransform({ x: 120, y: 60 });
                createSprite({ width: 20, height: 20 });
            })();
            // Half of it past the right edge of the frame.
            useSpawn(function Branch() {
                useTransform({ x: 160, y: 60 });
                createSprite({ width: 20, height: 20 });
            })();
            // Outside it, and one pinned to the screen inside it but left out.
            useSpawn(function Far() {
                useTransform({ x: 300, y: 160 });
                createSprite({ width: 10, height: 10 });
            })();
            useSpawn(function Hud() {
                useScreenSpace();
                useTransform({ x: 110, y: 50 });
                createSprite({ width: 4, height: 4 });
            }, 'Hud')();
        });
        const photo = await develop(capture()({ region: { x: 100, y: 40, width: 60, height: 40 }, width: 30, hide: ['Hud'] }));
        expect(photo.boxes.map((b) => b.name)).toEqual(['Bird', 'Branch']);
        expect(photo.boxes[0]!.seen).toBeCloseTo(1, 6);
        // In the photo's own pixels, half the size: (120 − 100) / 2, (60 − 40) / 2.
        expect(photo.boxes[0]!.x).toBeCloseTo(10, 6);
        expect(photo.boxes[0]!.y).toBeCloseTo(10, 6);
        expect(photo.boxes[1]!.seen).toBeCloseTo(0.5, 6);
    });

    it('counts each sprite of a box, as a game written in code makes them, and says which', async () => {
        let near!: TSprite;
        let far!: TSprite;
        const { capture, develop } = studio(() => {
            // Both in the scene's own box, the way createSprite in a scene body puts them.
            near = createSprite({ width: 10, height: 10, transform: { x: 20, y: 20 } });
            far = createSprite({ width: 10, height: 10, transform: { x: 300, y: 20 } });
        });
        const photo = await develop(capture()({ region: { x: 0, y: 0, width: 100, height: 100 } }));
        expect(photo.boxes.map((b) => b.picture)).toEqual([near]);
        expect(photo.boxes[0]!.seen).toBeCloseTo(1, 6);
        void far;
    });

    it('takes one photo after another when two are asked for at once', async () => {
        const { capture, develop } = studio(() => {});
        const first = capture()({ width: 32 });
        const second = capture()({ width: 16 });
        const both = await develop(Promise.all([first, second]));
        expect(both.map((p) => p.width)).toEqual([32, 16]);
    });
});
