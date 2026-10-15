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
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext } from '../src/render';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TCameraFollow } from '../src/hooks/camera/use_camera_follow';

/**
 * Drawing on whole pixels of the game (`pixelSnap`): where things are drawn is rounded, never where
 * they are, so a character the camera follows stays on the same pixel of the screen.
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
    it('is on for pixel art and off for a smooth game, unless the game says', () => {
        expect(cleanGameOptions({ width: 320, height: 224 }).pixelSnap).toBe(true);
        expect(cleanGameOptions({ width: 320, height: 224, smooth: true }).pixelSnap).toBe(false);
        expect(cleanGameOptions({ width: 320, height: 224, smooth: true, pixelSnap: true }).pixelSnap).toBe(true);
        expect(cleanGameOptions({ width: 320, height: 224, pixelSnap: false }).pixelSnap).toBe(false);
    });
});

describe('drawing on whole pixels', () => {
    it('draws a sprite on whole pixels, inside a moved object too, and leaves where it is alone', () => {
        const { store } = createTestGame({ pixelSnap: true });
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
        const { store } = createTestGame({ pixelSnap: false });
        let sprite!: TSprite;
        startTestScene(store, 'Level', () => {
            sprite = createSprite({ width: 8, height: 8, tint, transform: at(10.4, 20.6) });
            return createScene();
        });
        frame(store);
        expect(drawnAt(sprite)).toEqual([10.4, 20.6]);
    });

    it('keeps a character the camera follows on the same pixel of the screen while it walks', () => {
        const run = (pixelSnap: boolean) => {
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

        expect(run(true)).toEqual(new Set([184]));
        // Without it, the picture sits a different fraction of a pixel from the camera every frame.
        expect(run(false).size).toBeGreaterThan(1);
    });
});
