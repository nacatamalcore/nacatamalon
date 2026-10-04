import { describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useScreenSpace } from '../src/hooks/camera/use_screen_space';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TCamera2d } from '../src/camera';
import type { TFrameContext, TRenderPass } from '../src/render';
import type { TRuntimeStore } from '../src/store';

const tint = { r: 1, g: 1, b: 1, a: 1 };

/**
 * A sprite named by its width, so a frame reads as a list of numbers.
 */
const mark = (width: number, zIndex?: number) =>
    createSprite({ width, height: 1, tint, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, zIndex });

/**
 * What the renderer is handed this frame.
 */
const frame = (store: TRuntimeStore): TRenderPass => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx.passes[0];
};

/**
 * Each drawable's width paired with the camera it is drawn through.
 */
const views = (pass: TRenderPass): Array<[number, number]> =>
    (pass.drawables ?? []).map((drawable, i) => [
        drawable.type === 'sprite' ? drawable.width ?? -1 : -1,
        pass.cameraIndex?.[i] ?? NaN,
    ]);

describe('useCamera2d', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useCamera2d()).toThrow('[NacatamalOn] useCamera2d');
    });

    it('starts at the origin, not turned, with no zoom', () => {
        const { store } = createTestGame();
        let camera!: TCamera2d;
        startTestScene(store, 'Level', () => {
            camera = useCamera2d();
            return createScene();
        });

        expect(camera.type).toBe('camera2d');
        expect(camera.transform).toEqual({ x: 0, y: 0, rotation: 0 });
        expect(camera.zoom).toBe(1);
    });

    it('takes where it starts from its options', () => {
        const { store } = createTestGame();
        let camera!: TCamera2d;
        startTestScene(store, 'Level', () => {
            camera = useCamera2d({ x: 120, y: -40, rotation: 0.5, zoom: 2 });
            return createScene();
        });

        expect(camera.transform).toEqual({ x: 120, y: -40, rotation: 0.5 });
        expect(camera.zoom).toBe(2);
    });

    it('belongs to the scene, even when asked for from an object inside it', () => {
        const { store } = createTestGame();
        let camera!: TCamera2d;
        const Player = () => { camera = useCamera2d(); };

        const root = startTestScene(store, 'Level', () => {
            useSpawn(Player)();
            return createScene();
        });

        expect(root.camera2d).toBe(camera);
        expect(root.children[0].camera2d).toBeNull();
    });

    it('replaces the first camera when asked twice, and says so', () => {
        const { store } = createTestGame();
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();
        let second!: TCamera2d;

        const root = startTestScene(store, 'Level', () => {
            useCamera2d();
            second = useCamera2d({ x: 5 });
            return createScene();
        });

        expect(root.camera2d).toBe(second);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});

describe('useScreenSpace', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useScreenSpace()).toThrow('[NacatamalOn] useScreenSpace');
    });
});

describe('the camera each drawable is drawn through', () => {
    it('is the screen for a scene without a camera', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Menu', () => {
            mark(1); mark(2);
            return createScene();
        });

        const pass = frame(store);
        expect(pass.cameras).toEqual([]);
        expect(views(pass)).toEqual([[1, -1], [2, -1]]);
    });

    it('is the scene camera, handed over as the same object', () => {
        const { store } = createTestGame();
        let camera!: TCamera2d;
        startTestScene(store, 'Level', () => {
            camera = useCamera2d();
            mark(1); mark(2);
            return createScene();
        });

        const pass = frame(store);
        expect(pass.cameras?.[0]).toBe(camera);
        expect(views(pass)).toEqual([[1, 0], [2, 0]]);

        // The same reference, so a move made between two frames needs nothing rebuilt.
        camera.transform.x = 300;
        expect(frame(store).cameras?.[0].transform.x).toBe(300);
    });

    it('is the screen for everything under a box marked screen space, however deep', () => {
        const { store } = createTestGame();
        const Badge = () => { mark(4); };
        const Hud = () => {
            useScreenSpace();
            mark(3);
            useSpawn(Badge)();
        };

        startTestScene(store, 'Level', () => {
            useCamera2d();
            mark(1);
            useSpawn(Hud)();
            mark(2);
            return createScene();
        });

        // The scene's own sprites come first, then its children in order.
        expect(views(frame(store))).toEqual([[1, 0], [2, 0], [3, -1], [4, -1]]);
    });

    it('cannot pull a piece back into the world from inside a marked HUD', () => {
        const { store } = createTestGame();
        const Inner = () => { useScreenSpace(false); mark(2); };
        const Hud = () => { useScreenSpace(); mark(1); useSpawn(Inner)(); };

        startTestScene(store, 'Level', () => {
            useCamera2d();
            useSpawn(Hud)();
            return createScene();
        });

        // Inherited by OR: a HUD marked once cannot have a piece slip back into the world.
        expect(views(frame(store))).toEqual([[1, -1], [2, -1]]);
    });

    it('keeps each scene on its own camera, with a HUD scene on the screen', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useCamera2d();
            mark(1);
            return createScene();
        });
        startTestScene(store, 'Hud', () => {
            mark(2);
            return createScene();
        });
        startTestScene(store, 'Minimap', () => {
            useCamera2d({ zoom: 0.25 });
            mark(3);
            return createScene();
        });

        const pass = frame(store);
        expect(pass.cameras).toHaveLength(2);
        expect(pass.cameras?.[1].zoom).toBe(0.25);
        expect(views(pass)).toEqual([[1, 0], [2, -1], [3, 1]]);
    });

    it('travels with its drawable when zIndex reorders the scene', () => {
        const { store } = createTestGame();
        const Hud = () => { useScreenSpace(); mark(2, 5); };

        startTestScene(store, 'Level', () => {
            useCamera2d();
            mark(1, 10);
            mark(3, 0);
            useSpawn(Hud)();
            return createScene();
        });

        expect(views(frame(store))).toEqual([[3, 0], [2, -1], [1, 0]]);
    });
});
