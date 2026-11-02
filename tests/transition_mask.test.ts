import { describe, expect, it, spyOn } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { dissolve, fade } from '../src/transition';
import { findScene } from '../src/scene/find_scene';
import { registerScene } from '../src/scene/register_scene';
import { stopScene } from '../src/scene/stop_scene';
import { tick } from '../src/game/loop/tick';
import { useScene } from '../src/hooks/scene/use_scene';
import { useCleanup } from '../src/hooks/scene/use_cleanup';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import { createPixelTexture } from '../src/gameobjects/pixel_texture/create_pixel_texture';
import { createPixels } from '../src/pixels/create_pixels';
import { buildPostShader } from '../src/render/webgpu/post/post_shader';
import { buildPostShaderGlsl } from '../src/render/webgl2/post/post_shader';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';
import type { TTexture } from '../src/loaders/texture/types/t_texture';

/**
 * A transition that reads a picture: `dissolve`, and the `mask` any transition may carry.
 *
 * What is pinned is what the picture's lifetime has to be for the cover to look right: the clock
 * waits for it to land, so the cover never starts with half a shape, and it stays on the card until
 * the uncover is over, so a shape painted by the scene going out does not vanish at the swap. How
 * the shape looks is a question for a card, and the browser checks ask it there.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const FRAME = 1 / 60;

/**
 * A game whose frames are driven by hand, with a room `B` to go to and a handle on the room `A` it
 * starts in, which paints a mask of its own (no key, so it is that scene's alone).
 */
const twoRooms = () => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({}, canvas);
    const ctx = createFrameContext();
    let now = 0;
    const frame = (): void => {
        const prev = now;
        now += FRAME * 1000;
        tick(store, ctx, now, prev);
    };
    const frames = (seconds: number): void => {
        for (let left = seconds; left > 0; left -= FRAME) {
            frame();
        }
    };

    registerScene(store, 'B', () => createScene());
    let handle!: TSceneHandle;
    let painted!: TTexture;
    const counted = { cleaned: 0 };
    startTestScene(store, 'A', () => {
        handle = useScene();
        painted = createPixelTexture(createPixels(8, 8, { r: 0.5, g: 0.5, b: 0.5, a: 1 }));
        useCleanup(() => { counted.cleaned += 1; });
        return createScene();
    });

    return { store, frame, frames, counted, handle: () => handle, painted: () => painted };
};

/**
 * A mask still on its way, whose arrival the test decides.
 */
const loadingMask = (): TTexture => ({ type: 'texture', key: 'mask', src: 'mask.png', width: 0, height: 0, status: 'loading', gpu: null });

describe('dissolve', () => {
    it('carries both halves, its mask, and a kind for every knob', () => {
        const mask = loadingMask();
        const transition = dissolve(0.6, mask);

        expect(transition.fragment.length).toBeGreaterThan(0);
        expect(transition.fragmentGlsl!.length).toBeGreaterThan(0);
        expect(transition.mask).toBe(mask);
        expect(Object.keys(transition.uniformSig!).sort()).toEqual(Object.keys(transition.uniforms!).sort());
    });

    it('covers in black with a hard edge unless told, and keeps the softness between 0 and 1', () => {
        const mask = loadingMask();
        expect(dissolve(0.6, mask).uniforms).toEqual({ color: [0, 0, 0, 1], softness: 0 });
        expect(dissolve(0.6, mask, { softness: 3 }).uniforms!.softness).toBe(1);
        expect(dissolve(0.6, mask, { softness: -1 }).uniforms!.softness).toBe(0);
        expect(dissolve(0.6, mask, { color: { r: 1, g: 1, b: 1, a: 1 } }).uniforms!.color).toEqual([1, 1, 1, 1]);
    });

    it('reads its mask through a helper both cards have', () => {
        const transition = dissolve(0.6, loadingMask());
        expect(buildPostShader(transition.fragment, transition.uniformSig!)).toContain('fn sampleMask(');
        expect(buildPostShaderGlsl(transition.fragmentGlsl!, transition.uniformSig!).fragment).toContain('vec4 sampleMask(');
    });
});

describe('a transition with a mask', () => {
    it('hands the mask to the effect that draws it, and a transition without one has none', () => {
        const { store, handle } = twoRooms();
        const mask = loadingMask();
        handle().change('B', { transition: dissolve(0.3, mask) });
        expect(store.get('transition').active!.effect.mask).toBe(mask);

        const other = twoRooms();
        other.handle().change('B', { transition: fade(0.3) });
        expect(other.store.get('transition').active!.effect.mask).toBeUndefined();
    });

    it('does not start its clock until the mask has landed, and the scene going out goes on', () => {
        const { store, frame, frames, counted, handle } = twoRooms();
        const mask = loadingMask();
        handle().change('B', { transition: dissolve(0.3, mask) });
        const state = store.get('transition').active!;

        frames(0.5);
        expect(state.elapsed).toBe(0);
        expect(state.phase).toBe('cover');
        expect(counted.cleaned).toBe(0);

        mask.status = 'ready';
        frames(0.15);
        frame();
        expect(state.phase).toBe('reveal');
        expect(counted.cleaned).toBe(1);
    });

    it('starts at once with a mask that has already landed', () => {
        const { store, frame, handle, painted } = twoRooms();
        handle().change('B', { transition: dissolve(0.3, painted()) });
        frame();
        expect(store.get('transition').active!.elapsed).toBeGreaterThan(0);
    });
});

describe('a mask painted by the scene going out', () => {
    it('stays on the card through the uncover, and goes once the transition is over', () => {
        const { store, frame, frames, counted, handle, painted } = twoRooms();
        const mask = painted();
        const gpu = mask.gpu;
        expect(gpu).not.toBeNull();
        const destroyed = spyOn(store.get('screen').renderer, 'destroyTexture');

        handle().change('B', { transition: dissolve(0.3, mask) });
        frames(0.15);
        frame();
        // The swap: the scene that painted it has stopped, and its picture with it, but only as a
        // record. The uncover still reads it.
        expect(counted.cleaned).toBe(1);
        expect(mask.status).toBe('released');
        expect(mask.gpu).toBe(gpu);
        expect(destroyed.mock.calls.some(([texture]) => texture === gpu)).toBe(false);

        frames(0.2);
        expect(store.get('transition').active).toBeNull();
        expect(destroyed.mock.calls.some(([texture]) => texture === gpu)).toBe(true);
        expect(mask.gpu).toBeNull();
    });

    it('goes at once when no transition is reading it', () => {
        const { store, handle, painted } = twoRooms();
        const mask = painted();
        const gpu = mask.gpu;
        const destroyed = spyOn(store.get('screen').renderer, 'destroyTexture');

        handle().change('B');
        expect(mask.status).toBe('released');
        expect(mask.gpu).toBeNull();
        expect(destroyed.mock.calls.some(([texture]) => texture === gpu)).toBe(true);
    });

    it('goes when the transition is dropped by stopping the scene it was bringing in', () => {
        const { store, frame, frames, handle, painted } = twoRooms();
        const mask = painted();
        const gpu = mask.gpu;
        const destroyed = spyOn(store.get('screen').renderer, 'destroyTexture');

        handle().change('B', { transition: dissolve(0.3, mask) });
        frames(0.15);
        frame();
        expect(mask.gpu).toBe(gpu);

        stopScene(store, findScene(store, 'B')!);
        expect(store.get('transition').active).toBeNull();
        expect(destroyed.mock.calls.some(([texture]) => texture === gpu)).toBe(true);
        expect(mask.gpu).toBeNull();
    });
});

describe('a mask painted by a scene restarting itself', () => {
    /**
     * A level that paints its own mask, unnamed, and restarts itself under a dissolve with it.
     */
    const restarting = (throwOnSecond = false) => {
        const canvas = createFakeCanvas(480, 320);
        const { store } = createTestGame({}, canvas);
        const ctx = createFrameContext();
        let now = 0;
        const frames = (seconds: number): void => {
            for (let left = seconds; left > 0; left -= FRAME) {
                const prev = now;
                now += FRAME * 1000;
                tick(store, ctx, now, prev);
            }
        };
        const copies: Array<{ handle: TSceneHandle; mask: TTexture }> = [];
        startTestScene(store, 'Level', () => {
            if (throwOnSecond && copies.length === 1) {
                throw new Error('the second copy breaks');
            }
            copies.push({ handle: useScene(), mask: createPixelTexture(createPixels(8, 8, { r: 0.5, g: 0.5, b: 0.5, a: 1 })) });
            return createScene();
        });
        return { store, frames, copies };
    };

    it('is kept through the uncover after the old copy has stopped, and goes at the end', () => {
        const { store, frames, copies } = restarting();
        const [old] = copies;
        const gpu = old!.mask.gpu;
        const destroyed = spyOn(store.get('screen').renderer, 'destroyTexture');

        old!.handle.change('Level', { transition: dissolve(0.3, old!.mask) });
        frames(0.2);
        expect(copies).toHaveLength(2);
        expect(old!.mask.status).toBe('released');
        expect(old!.mask.gpu).toBe(gpu);
        expect(destroyed.mock.calls.some(([texture]) => texture === gpu)).toBe(false);

        frames(0.2);
        expect(store.get('transition').active).toBeNull();
        expect(destroyed.mock.calls.some(([texture]) => texture === gpu)).toBe(true);
        // The new copy's own is untouched.
        expect(copies[1]!.mask.gpu).not.toBeNull();
    });

    it('goes when the new copy fails to build and takes the cover with it', () => {
        const { store, frames, copies } = restarting(true);
        const [old] = copies;
        const gpu = old!.mask.gpu;
        const destroyed = spyOn(store.get('screen').renderer, 'destroyTexture');
        const said = spyOn(console, 'error').mockImplementation(() => {});

        old!.handle.change('Level', { transition: dissolve(0.3, old!.mask) });
        frames(0.2);
        expect(said).toHaveBeenCalled();
        expect(store.get('transition').active).toBeNull();
        expect(destroyed.mock.calls.some(([texture]) => texture === gpu)).toBe(true);
        said.mockRestore();
    });
});
