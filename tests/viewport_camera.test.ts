import { describe, expect, it } from 'bun:test';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createSpriteTexture } from '../src/gameobjects/sprite_texture';
import { useCubeGeometry } from '../src/hooks';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { createCamera2d, createCamera3d } from '../src/camera';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext, TRenderPass } from '../src/render/interface';
import type { TCamera2d, TCamera3d } from '../src/camera';

/**
 * The cameras a tool looks at the screen through: an editor flying round a level without moving the
 * camera the level was written with.
 *
 * What matters is **where they reach**: the screen, and nothing else. A picture drawn inside the
 * level keeps its own camera, because what a monitor shows is part of the level.
 */

const frame = (store: ReturnType<typeof createTestGame>['store']): TFrameContext => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx, 0);
    return ctx;
};

const screenOf = (ctx: TFrameContext): TRenderPass => ctx.passes[ctx.passes.length - 1];

const level = (store: ReturnType<typeof createTestGame>['store']) => {
    let own3d!: TCamera3d;
    let own2d!: TCamera2d;
    startTestScene(store, 'Level', () => {
        own3d = useCamera3d({ projection: 'perspective', z: 5 });
        own2d = useCamera2d({ x: 10 });
        createMesh({ geometry: useCubeGeometry() });
        createSprite({ width: 8, height: 8 });
        return createScene();
    });
    return { own3d, own2d };
};

describe('the viewport cameras', () => {
    it('are the scene\'s own until a tool sets them', () => {
        const { store } = createTestGame();
        const { own3d, own2d } = level(store);

        const screen = screenOf(frame(store));
        expect(screen.views3d?.[0].camera).toBe(own3d);
        expect(screen.cameras).toEqual([own2d]);
    });

    it('replace both of the scene\'s cameras on the screen, read live and not copied', () => {
        const { store } = createTestGame();
        level(store);
        const flying = createCamera3d({ projection: 'perspective', y: 3, z: 9 });
        const panning = createCamera2d({ x: 40, zoom: 2 });
        store.setState('viewport', { camera3d: flying, camera2d: panning });

        const screen = screenOf(frame(store));
        expect(screen.views3d?.[0].camera).toBe(flying);
        expect(screen.cameras).toEqual([panning]);
    });

    it('give a scene with no 2D camera of its own one to be looked at through', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Flat', () => {
            createSprite({ width: 8, height: 8 });
            return createScene();
        });
        const panning = createCamera2d({ x: 40 });
        store.setState('viewport', { camera2d: panning });

        const screen = screenOf(frame(store));
        expect(screen.cameras).toEqual([panning]);
        expect(screen.cameraIndex?.[0]).toBe(0);
    });

    it('go back to the scene\'s own when set to null', () => {
        const { store } = createTestGame();
        const { own3d } = level(store);
        store.setState('viewport', { camera3d: createCamera3d({ projection: 'perspective' }) });
        store.setState('viewport', { camera3d: null });

        expect(screenOf(frame(store)).views3d?.[0].camera).toBe(own3d);
    });

    it('leave a picture drawn inside the level with its own camera', () => {
        const { store } = createTestGame();
        let inner!: TCamera2d;
        startTestScene(store, 'Level', () => {
            createSpriteTexture({ width: 32, height: 32 }, () => {
                useSpawn(() => {
                    inner = useCamera2d({ x: 5 });
                })();
                createSprite({ width: 4, height: 4 });
            });
            return createScene();
        });
        store.setState('viewport', { camera2d: createCamera2d({ x: 999 }) });

        const ctx = frame(store);
        const picture = ctx.passes.find((pass) => pass.renderTarget !== undefined)!;
        expect(picture.cameras).not.toContainEqual(expect.objectContaining({ transform: expect.objectContaining({ x: 999 }) }));
        void inner;
    });

    it('show only the kinds a tool asks for on the screen, and everything again with null', () => {
        const { store } = createTestGame();
        level(store);
        const kinds = () => screenOf(frame(store)).drawables?.map((d) => d.type).sort();

        expect(kinds()).toEqual(['mesh', 'sprite']);
        store.setState('viewport', { layers: ['sprite'] });
        expect(kinds()).toEqual(['sprite']);
        store.setState('viewport', { layers: ['mesh', 'lines'] });
        expect(kinds()).toEqual(['mesh']);
        store.setState('viewport', { layers: null });
        expect(kinds()).toEqual(['mesh', 'sprite']);
    });

    it('keep each drawing on its own camera when some kinds are hidden', () => {
        const { store } = createTestGame();
        const { own2d } = level(store);
        store.setState('viewport', { layers: ['sprite'] });

        const screen = screenOf(frame(store));
        expect(screen.drawables).toHaveLength(1);
        expect(screen.cameras?.[screen.cameraIndex![0]]).toBe(own2d);
    });

    it('leave a picture drawn inside the level showing everything', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            createSpriteTexture({ width: 32, height: 32 }, () => {
                createSprite({ width: 4, height: 4 });
            });
            return createScene();
        });
        store.setState('viewport', { layers: ['mesh'] });

        const picture = frame(store).passes.find((pass) => pass.renderTarget !== undefined)!;
        expect(picture.drawables?.map((d) => d.type)).toEqual(['sprite']);
    });
});
