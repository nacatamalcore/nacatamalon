import { describe, expect, it } from 'bun:test';
import { cleanGameOptions } from '../src/game/bootstrap/clean_gameoptions';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useCameraFollow } from '../src/hooks/camera/use_camera_follow';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { usePointer } from '../src/hooks/input/use_pointer';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { createGameHandle } from '../src/game/handle';
import { RENDER } from '../src/CONST';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext } from '../src/render';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TCameraFollow } from '../src/hooks/camera/use_camera_follow';
import type { TCamera2d } from '../src/camera';
import type { TPixelSnap } from '../src/game/types/t_game_options';

/**
 * Drawing on whole pixels (`pixelSnap`), of the screen or of the game: where things are drawn is
 * rounded, never where they are, so a character the camera follows stays on the same pixel of the
 * screen.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const drawnAt = (thing: { transform: { x: number; y: number }; worldTransform?: { x: number; y: number } }) => {
    const place = thing.worldTransform ?? thing.transform;
    return [place.x, place.y];
};
const frame = (store: Parameters<typeof fillFrameContext>[0]) => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
};

describe('the pixelSnap option', () => {
    it('is the screen\'s pixels for pixel art and off for a smooth game, unless the game says', () => {
        expect(cleanGameOptions({ width: 320, height: 224 }).pixelSnap).toBe('screen');
        expect(cleanGameOptions({ width: 320, height: 224, smooth: true }).pixelSnap).toBe('off');
        expect(cleanGameOptions({ width: 320, height: 224, smooth: true, pixelSnap: 'screen' }).pixelSnap).toBe('screen');
        expect(cleanGameOptions({ width: 320, height: 224, pixelSnap: RENDER.PIXEL_SNAP.GAME }).pixelSnap).toBe('game');
        expect(cleanGameOptions({ width: 320, height: 224, pixelSnap: 'off' }).pixelSnap).toBe('off');
    });

    it('refuses anything but the three, a yes or no from before there were three too', () => {
        expect(() => cleanGameOptions({ width: 320, height: 224, pixelSnap: true as never })).toThrow(/pixelSnap must be 'screen', 'game', 'off', got true/);
        expect(() => cleanGameOptions({ width: 320, height: 224, pixelSnap: 'pixels' as never })).toThrow(/pixelSnap/);
    });
});

describe('drawing on whole pixels', () => {
    it('draws a sprite on whole pixels, inside a moved object too, and leaves where it is alone', () => {
        const { store } = createTestGame({ pixelSnap: 'game' });
        let sprite!: TSprite;
        let inside!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({ width: 8, height: 8, tint, transform: at(10.4, 20.6) });
            useSpawn(function Moved() {
                useTransform({ x: 3.3, y: 7.1 });
                inside = createSprite({ width: 8, height: 8, tint, transform: at(0.3, 0.3) });
            })();
            return createScene();
        });
        frame(store);

        expect(drawnAt(sprite)).toEqual([10, 21]);
        expect([sprite.transform.x, sprite.transform.y]).toEqual([10.4, 20.6]);
        // At 3.6, 7.4 once the object is applied: drawn at 4, 7.
        expect(drawnAt(inside)).toEqual([4, 7]);
    });

    it('draws where things are, fractions and all, when it is off', () => {
        const { store } = createTestGame({ pixelSnap: 'off' });
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({ width: 8, height: 8, tint, transform: at(10.4, 20.6) });
            return createScene();
        });
        frame(store);
        expect(drawnAt(sprite)).toEqual([10.4, 20.6]);
    });

    it('keeps a character the camera follows on the same pixel of the screen while it walks', () => {
        const run = (pixelSnap: TPixelSnap) => {
            const { store } = createTestGame({ pixelSnap }, createFakeCanvas(320, 224));
            const ctx = createFrameContext();
            let hero!: TSprite;
            let follow!: TCameraFollow;
            registerScene(store, 'Level', () => {
                const object = useSpawn(function Hero() {
                    hero = createSprite({ width: 12, height: 24, tint, transform: at(100, 100) });
                    // 110 pixels a second at 60 frames: 1.83 a frame, never a whole number.
                    useUpdate((delta) => { hero.transform.x += 110 * delta; });
                })();
                follow = useCameraFollow(object, { deadzone: { width: 48, height: 64 } });
                return createScene();
            });
            startScene(store, 'Level');
            let now = 0;
            const onScreen = new Set<number>();
            for (let i = 0; i < 90; i++) {
                const prev = now;
                now += 1000 / 60;
                tick(store, ctx, now, prev);
                // Once the hero is pushing the dead zone along, where it lands on the screen.
                if (i > 30) onScreen.add(Math.round((drawnAt(hero)[0] - follow.camera.transform.x) * 1000) / 1000);
            }
            return onScreen;
        };

        expect(run('game')).toEqual(new Set([184]));
        expect(run('screen')).toEqual(new Set([184]));
        // Without it, the picture sits a different fraction of a pixel from the camera every frame.
        expect(run('off').size).toBeGreaterThan(1);
    });
    it('draws a camera moved by hand on whole pixels too, and leaves where it is alone', () => {
        const run = (pixelSnap: TPixelSnap) => {
            const { store } = createTestGame({ pixelSnap });
            let camera!: TCamera2d;
            startTestScene(store, 'Level', () => {
                camera = useCamera2d({ transform: { x: 40.6, y: 12.4 }, zoom: 2 });
                createSprite({ width: 8, height: 8, tint, transform: at(0, 0) });
                return createScene();
            });
            const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
            fillFrameContext(store, ctx);
            return { drawn: ctx.passes[0]!.cameras![0]!, camera };
        };

        const game = run('game');
        expect([game.drawn.transform.x, game.drawn.transform.y, game.drawn.zoom]).toEqual([41, 12, 2]);
        expect([game.camera.transform.x, game.camera.transform.y]).toEqual([40.6, 12.4]);
        // At zoom 2 a pixel of the screen is half one of the world: 81.2 and 24.8 screen pixels in.
        const screen = run('screen');
        expect([screen.drawn.transform.x, screen.drawn.transform.y]).toEqual([40.5, 12.5]);
        expect([screen.camera.transform.x, screen.camera.transform.y]).toEqual([40.6, 12.4]);
        expect(run('off').drawn.transform.x).toBe(40.6);
    });

    it('is turned on and off while the game runs, from the next frame, moving nothing', () => {
        const { store } = createTestGame({ pixelSnap: 'game' });
        let camera!: TCamera2d;
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            camera = useCamera2d({ transform: { x: 40.6, y: 0 } });
            sprite = createSprite({ width: 8, height: 8, tint, transform: at(10.4, 20.6) });
            return createScene();
        });
        const game = createGameHandle(store);
        const drawnCamera = () => {
            const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
            fillFrameContext(store, ctx);
            return ctx.passes[0]!.cameras![0]!.transform.x;
        };

        expect(game.getPixelSnap()).toBe('game');
        expect(drawnCamera()).toBe(41);
        expect(drawnAt(sprite)).toEqual([10, 21]);

        game.setPixelSnap('off');
        expect(game.getPixelSnap()).toBe('off');
        expect(drawnCamera()).toBe(40.6);
        expect(drawnAt(sprite)).toEqual([10.4, 20.6]);
        // Where they are was never touched.
        expect([camera.transform.x, sprite.transform.x]).toEqual([40.6, 10.4]);

        game.setPixelSnap('game');
        expect(drawnCamera()).toBe(41);
    });

    it('reads the world under the pointer through the camera as it is drawn, so what is touched is what is seen', () => {
        const run = (pixelSnap: TPixelSnap) => {
            const canvas = createFakeCanvas(320, 224);
            const { store } = createTestGame({ pixelSnap }, canvas);
            const ctx = createFrameContext();
            const seen: number[] = [];
            let pointer!: ReturnType<typeof usePointer>;
            registerScene(store, 'Level', () => {
                useCamera2d({ transform: { x: 40.6, y: 0 } });
                pointer = usePointer();
                pointer.onDown((info) => seen.push(info.worldX));
                return createScene();
            });
            startScene(store, 'Level');
            tick(store, ctx, 0, 0);
            canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 160, clientY: 112, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse' }));
            tick(store, ctx, 1000 / 60, 0);
            return { clicked: seen[0], hovered: pointer.position()?.worldX };
        };

        // 160 pixels into the screen from a camera drawn at 41, not at 40.6.
        expect(run('game')).toEqual({ clicked: 201, hovered: 201 });
        expect(run('off')).toEqual({ clicked: 200.6, hovered: 200.6 });
    });
});

describe('drawing on whole pixels of the screen', () => {
    // At zoom 3 a pixel of the art is three of the screen: the screen's pixels are thirds of the world.
    const zoomed = (x: number) => {
        const { store } = createTestGame({ pixelSnap: 'screen' });
        let camera!: TCamera2d;
        let sprite!: TSprite;
        let pinned!: TSprite;
        startTestScene(store, 'Level', () => {
            camera = useCamera2d({ transform: { x, y: 0 }, zoom: 3 });
            sprite = createSprite({ width: 16, height: 16, tint, transform: at(10.4, 20.6) });
            useSpawn(function Hud() {
                useScreenSpace();
                pinned = createSprite({ width: 8, height: 8, tint, transform: at(5.4, 5.6) });
            })();
            return createScene();
        });
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx);
        return { drawn: ctx.passes[0]!.cameras![0]!, camera, sprite, pinned };
    };

    it('puts the camera and each thing on whole pixels of the screen, which at zoom 3 are thirds', () => {
        const { drawn, camera, sprite } = zoomed(40.6);
        // 121.8 screen pixels in: drawn from 122, which is 40 and two thirds.
        expect(drawn.transform.x * 3).toBeCloseTo(122, 9);
        expect(drawnAt(sprite)[0]! * 3).toBeCloseTo(31, 9);
        expect(drawnAt(sprite)[1]! * 3).toBeCloseTo(62, 9);
        // Where they are was never touched.
        expect([camera.transform.x, sprite.transform.x]).toEqual([40.6, 10.4]);
    });

    it('leaves every texel as wide as the next: the edges of a sprite land on whole screen pixels', () => {
        for (let x = 0; x < 3; x += 0.07) {
            const { drawn, sprite } = zoomed(x);
            const left = (drawnAt(sprite)[0]! - drawn.transform.x) * 3;
            expect(Math.abs(left - Math.round(left))).toBeLessThan(1e-6);
        }
    });

    it('moves a screen pixel at a time, not a whole pixel of the art', () => {
        const seen = new Set<number>();
        for (let x = 0; x < 1; x += 0.05) {
            const { drawn, sprite } = zoomed(x);
            seen.add(Math.round((drawnAt(sprite)[0]! - drawn.transform.x) * 3));
        }
        // Over one pixel of the art the sprite is drawn at four places on the screen, three apart
        // at most one each, where on the game's pixels it would jump the three at once.
        expect([...seen].sort((a, b) => b - a)).toEqual([31, 30, 29, 28]);
    });

    it('draws what is pinned to the screen on whole pixels, since it is not zoomed', () => {
        expect(drawnAt(zoomed(40.6).pinned)).toEqual([5, 6]);
    });

    it('reads the world under the pointer through the camera on the screen\'s pixels', () => {
        const canvas = createFakeCanvas(320, 224);
        const { store } = createTestGame({ pixelSnap: 'screen' }, canvas);
        const ctx = createFrameContext();
        let clicked = 0;
        registerScene(store, 'Level', () => {
            useCamera2d({ transform: { x: 40.6, y: 0 }, zoom: 2 });
            usePointer().onDown((info) => { clicked = info.worldX; });
            return createScene();
        });
        startScene(store, 'Level');
        tick(store, ctx, 0, 0);
        canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 160, clientY: 112, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse' }));
        tick(store, ctx, 1000 / 60, 0);
        // 160 screen pixels at zoom 2 are 80 of the world, from a camera drawn at 40.5.
        expect(clicked).toBe(120.5);
    });
});
