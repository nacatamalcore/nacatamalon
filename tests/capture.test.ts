import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { captureScreen } from '../src/game/capture';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useCubeGeometry } from '../src/hooks';
import { useCamera3d } from '../src/hooks/camera/use_camera_3d';
import { useCamera2d } from '../src/hooks/camera/use_camera_2d';
import { createCamera2d, createCamera3d } from '../src/camera';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { setCameraPreview } from '../src/game/preview';
import { createParticles, emitParticles } from '../src/gameobjects/particles';
import { newParticlesFile } from '../src/loaders/particles/new_particles_file';
import { PARTICLE_FLOATS, PARTICLE_OFFSET } from '../src/render/shared/particle_instance';
import { effectDoc } from './helpers/particles';
import type { ITexture, TRenderPass } from '../src/render/interface';
import type { TCamera2d, TCamera3d } from '../src/camera';

/**
 * A tool asking for a picture of the game.
 *
 * The screen of a WebGPU game cannot be read back, so a capture is one more pass, into a picture of
 * its own, read once its frame is over. What is pinned here is what that pass is **of**: the screen
 * when nothing is said, something else when something is, and never the screen changed to get it.
 * And that the promise always settles, because a capture waiting on a frame that threw would hang
 * whoever asked.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

/**
 * A level with a model and a sprite in it, driven one frame at a time by hand.
 */
const driven = () => {
    const { store, renderer } = createTestGame({}, createFakeCanvas(320, 224));
    let own!: TCamera3d;
    startTestScene(store, 'Level', () => {
        own = useCamera3d({ projection: 'perspective', z: 5 });
        createMesh({ geometry: useCubeGeometry() });
        createSprite({ width: 8, height: 8 });
        return createScene();
    });

    // Which picture was made, at what size, and which one was read back.
    const made: Array<{ texture: ITexture; width: number; height: number }> = [];
    const read: ITexture[] = [];
    renderer.createRenderTexture = (width, height) => {
        const texture: ITexture = { resourceType: 'texture' };
        made.push({ texture, width, height });
        return texture;
    };
    renderer.readTexture = async (texture) => {
        read.push(texture);
        return { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) };
    };

    const ctx = createFrameContext();
    let now = 0;
    const frame = (): TRenderPass[] => {
        const prev = now;
        now += 16;
        tick(store, ctx, now, prev);
        return [...ctx.passes];
    };
    /**
     * The pass drawn into `texture` this frame, if any.
     */
    const passInto = (passes: TRenderPass[], texture: ITexture) => passes.find((pass) => pass.renderTarget === texture);

    return { store, renderer, own, made, read, frame, passInto };
};

/**
 * `promise`, or a failure if it has not settled within half a second. A capture that is never
 * settled is exactly the bug some of these guard against, and it has to fail the run, not hang it.
 */
const settles = <T>(promise: Promise<T>): Promise<T> => Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the capture never settled')), 500)),
]);

const kinds = (pass: TRenderPass | undefined): string[] => (pass?.drawables ?? []).map((item) => item.type);

describe('a capture', () => {
    it('costs nothing until one is asked for', () => {
        const { frame } = driven();
        expect(frame()).toHaveLength(1);
    });

    it('is one more pass, into its own picture, and is read back once its frame is over', async () => {
        const { store, made, read, frame, passInto } = driven();

        const shot = captureScreen(store);
        const passes = frame();
        const pass = passInto(passes, made[0].texture);

        expect(passes).toHaveLength(2);
        // Before the screen, which stays the last pass and the one a person looks at.
        expect(passes[0]).toBe(pass!);
        expect(passes[1].renderTarget).toBeUndefined();
        // It stands in for looking at the screen, so it wants the screen's look.
        expect(pass!.postProcess).toBe(true);
        expect(pass!.clearColor).toEqual(store.get('config').background);

        expect(await settles(shot)).toEqual({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) });
        expect(read).toEqual([made[0].texture]);
    });

    it('lets its picture go once it has been read: one picture per capture would never leave the graphics card', async () => {
        const { store, renderer, made, frame } = driven();

        const shot = captureScreen(store);
        expect(renderer.destroyedTextures).toEqual([]);
        frame();
        await settles(shot);

        expect(renderer.destroyedTextures).toEqual([made[0].texture]);
    });

    it('is taken once: the frame after has no capture in it', async () => {
        const { store, frame } = driven();
        const shot = captureScreen(store);
        frame();
        await settles(shot);

        expect(frame()).toHaveLength(1);
        expect(store.get('capture').request).toBeNull();
    });

    it('is the size of the canvas unless told otherwise, in whole pixels', () => {
        const { store, made } = driven();
        void captureScreen(store);
        store.setState('capture', { request: null });
        void captureScreen(store, { width: 64.7, height: 48.2 });

        expect(made.map(({ width, height }) => [width, height])).toEqual([[320, 224], [64, 48]]);
    });

    it('with nothing said, is the screen: the tool\'s camera and the tool\'s filter', () => {
        const { store, made, frame, passInto } = driven();
        const flying = createCamera3d({ projection: 'perspective', y: 3, z: 9 });
        const panning = createCamera2d({ x: 40 });
        store.setState('viewport', { camera3d: flying, camera2d: panning, layers: ['sprite'] });

        void captureScreen(store);
        const pass = passInto(frame(), made[0].texture);

        expect(pass!.views3d ?? []).toEqual([]);
        expect(pass!.cameras).toEqual([panning]);
        expect(kinds(pass)).toEqual(['sprite']);
    });

    it('with `null` layers draws everything, whatever the screen is hiding', () => {
        const { store, made, frame, passInto } = driven();
        store.setState('viewport', { layers: ['sprite'] });

        void captureScreen(store, { layers: null });
        const passes = frame();

        expect(kinds(passInto(passes, made[0].texture)).sort()).toEqual(['mesh', 'sprite']);
        // And the screen is still hiding the model: the capture asked, it did not change anything.
        expect(kinds(passes[passes.length - 1])).toEqual(['sprite']);
    });

    it('through a camera of its own, without moving the screen off the tool\'s', () => {
        const { store, own, made, frame, passInto } = driven();
        const flying = createCamera3d({ projection: 'perspective', y: 3, z: 9 });
        store.setState('viewport', { camera3d: flying });
        // Neither the tool's nor the scene's, so the answer can only have come from the options.
        const game = createCamera3d({ projection: 'perspective', x: -4, z: 7 });

        void captureScreen(store, { camera3d: game });
        const passes = frame();

        expect(own).not.toBe(game);
        expect(passInto(passes, made[0].texture)!.views3d?.[0].camera).toBe(game);
        expect(passes[passes.length - 1].views3d?.[0].camera).toBe(flying);
    });

    it('with `null` cameras is the game: each scene\'s own, whatever the tool is looking through', () => {
        const { store, own, made, frame, passInto } = driven();
        const flying = createCamera3d({ projection: 'perspective', y: 3, z: 9 });
        const panning = createCamera2d({ x: 40 });
        store.setState('viewport', { camera3d: flying, camera2d: panning });

        void captureScreen(store, { camera3d: null, camera2d: null });
        const passes = frame();
        const pass = passInto(passes, made[0].texture)!;

        expect(pass.views3d?.[0].camera).toBe(own);
        // The level has no 2D camera of its own, so its sprite is in screen pixels, as in the game.
        expect(pass.cameras).toEqual([]);
        expect(pass.cameraIndex).toEqual(pass.drawables!.map(() => -1));
        // And the screen goes on looking through the tool's.
        expect(passes[passes.length - 1].views3d?.[0].camera).toBe(flying);
        expect(passes[passes.length - 1].cameras).toEqual([panning]);
    });

    it('with a `null` 2D camera uses the scene\'s own when it has one', () => {
        const { store, renderer } = createTestGame({}, createFakeCanvas(320, 224));
        let own2d!: TCamera2d;
        startTestScene(store, 'Flat', () => {
            own2d = useCamera2d({ x: 10, zoom: 2 });
            createSprite({ width: 8, height: 8 });
            return createScene();
        });
        const target: ITexture = { resourceType: 'texture' };
        renderer.createRenderTexture = () => target;
        store.setState('viewport', { camera2d: createCamera2d({ x: 40 }) });

        void captureScreen(store, { camera2d: null });
        const ctx = createFrameContext();
        tick(store, ctx, 16, 0);

        expect(ctx.passes.find((pass) => pass.renderTarget === target)!.cameras).toEqual([own2d]);
    });

    it('is drawn while the game is paused: it asks for pixels, not for time', async () => {
        const { store, frame } = driven();
        store.setState('loop', { pausedBy: ['editor'] });

        const shot = captureScreen(store);
        expect(frame()).toHaveLength(2);
        await settles(shot);
    });

    it('fails with the frame\'s error instead of waiting for ever when that frame throws', async () => {
        const { store, renderer, frame } = driven();
        renderer.frame = () => {
            throw new Error('device lost');
        };

        const shot = captureScreen(store);
        expect(frame).toThrow('device lost');
        await expect(settles(shot)).rejects.toThrow('device lost');
        expect(store.get('capture').request).toBeNull();
        // And its picture goes all the same.
        expect(renderer.destroyedTextures).toHaveLength(1);
    });

    it('refuses a second one while the first is waiting for its frame', async () => {
        const { store, frame } = driven();
        const first = captureScreen(store);

        await expect(settles(captureScreen(store))).rejects.toThrow('another capture');
        frame();
        await settles(first);
    });

    it('refuses to be asked of a game that has been destroyed', async () => {
        const { store } = driven();
        store.setState('loop', { destroyed: true });

        await expect(settles(captureScreen(store))).rejects.toThrow('destroyed');
    });
});

describe('a second look at flat particles', () => {
    it('leaves the camera the screen draws them through alone, and gives the second look its own', () => {
        const { store } = createTestGame({}, createFakeCanvas(320, 224));
        const file = newParticlesFile('flat', 'flat');
        file.doc = effectDoc({ spread: 0, speed: 0, life: 9, max: 4 });
        file.status = 'ready';
        store.get('assets').particles.set('flat', file);
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'Level', () => {
            emitter = createParticles({ effect: 'flat', autoplay: false });
            return createScene();
        });
        emitParticles(emitter, 2);

        // The scene has no 2D camera, so the screen draws it in screen pixels (view 0), and the
        // preview looks through one of its own (view 1).
        setCameraPreview(store, { canvas: {} as HTMLCanvasElement, camera2d: createCamera2d(), camera3d: null, layers: null });
        const ctx = createFrameContext();
        fillFrameContext(store, ctx, 1 / 60);

        const viewOf = (pass: TRenderPass): number[] => {
            const drawn = (pass.drawables ?? []).find((item) => item.type === 'particles') as unknown as { instances: Float32Array; count: number };
            return Array.from({ length: drawn.count }, (_, k) => drawn.instances[k * PARTICLE_FLOATS + PARTICLE_OFFSET.view]!);
        };
        const screen = ctx.passes[ctx.passes.length - 1]!;
        const preview = ctx.passes.find((pass) => pass.targetCanvas !== undefined)!;

        expect(viewOf(screen)).toEqual([0, 0]);
        expect(viewOf(preview)).toEqual([1, 1]);
    });
});

describe('a camera preview', () => {
    const canvas = {} as HTMLCanvasElement;
    const onto = (passes: TRenderPass[]) => passes.find((pass) => pass.targetCanvas === canvas);

    it('is one more pass on every frame while it is on, onto its canvas, before the screen', () => {
        const { store, frame } = driven();
        setCameraPreview(store, { canvas, camera3d: null, camera2d: null, layers: null });

        for (let i = 0; i < 2; i++) {
            const passes = frame();
            expect(passes).toHaveLength(2);
            expect(onto(passes)).toBe(passes[0]);
            expect(passes[0].postProcess).toBe(true);
            expect(passes[0].clearColor).toEqual(store.get('config').background);
        }
    });

    it('costs nothing again once it is turned off', () => {
        const { store, frame } = driven();
        setCameraPreview(store, { canvas });
        frame();
        setCameraPreview(store, null);

        expect(frame()).toHaveLength(1);
    });

    it('left out, sees what the screen shows; null, what the game shows', () => {
        const { store, own, frame } = driven();
        const flying = createCamera3d({ projection: 'perspective', z: 40 });
        store.setState('viewport', { camera3d: flying, layers: ['sprite'] });

        setCameraPreview(store, { canvas });
        const screenLike = onto(frame())!;
        expect(screenLike.views3d ?? []).toEqual([]);
        expect(kinds(screenLike)).toEqual(['sprite']);

        setCameraPreview(store, { canvas, camera3d: null, layers: null });
        const gameLike = onto(frame())!;
        expect(gameLike.views3d?.[0]?.camera).toBe(own);
        expect(kinds(gameLike).sort()).toEqual(['mesh', 'sprite']);
    });
});

describe('particles the screen does not show', () => {
    it('still move, so a picture of the game finds them where they got to', () => {
        const { store } = createTestGame({}, createFakeCanvas(320, 224));
        const file = newParticlesFile('flat', 'flat');
        file.doc = effectDoc({ max: 50, life: 5, emission: { rate: 60, burst: 0, duration: 0, loop: true } });
        file.status = 'ready';
        store.get('assets').particles.set('flat', file);
        startTestScene(store, 'Level', () => {
            createParticles({ effect: 'flat' });
            return createScene();
        });
        // The screen shows models only, as an editor's 3D view does.
        store.setState('viewport', { layers: ['mesh'] });
        const canvas = {} as HTMLCanvasElement;
        setCameraPreview(store, { canvas, camera3d: null, camera2d: null, layers: null });

        const ctx = createFrameContext();
        const counted = () => {
            fillFrameContext(store, ctx, 1 / 60);
            const pass = ctx.passes.find((p) => p.targetCanvas === canvas)!;
            return (pass.drawables ?? []).filter((item) => item.type === 'particles').map((item) => (item as unknown as { count: number }).count)[0] ?? 0;
        };
        counted();
        const early = counted();
        for (let i = 0; i < 20; i++) counted();

        expect(early).toBeGreaterThan(0);
        expect(counted()).toBeGreaterThan(early);
    });
});
