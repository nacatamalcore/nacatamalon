import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { fade } from '../src/transition';
import { findScene } from '../src/scene/find_scene';
import { registerScene } from '../src/scene/register_scene';
import { stopScene } from '../src/scene/stop_scene';
import { tick } from '../src/game/loop/tick';
import { trackLoad } from '../src/loaders/track_load';
import { usePointer } from '../src/hooks/input/use_pointer';
import { useScene } from '../src/hooks/scene/use_scene';
import { useSceneUnmount } from '../src/hooks/scene/use_scene_unmount';
import { useUpdate } from '../src/hooks/loop/use_update';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TLoadStatus } from '../src/loaders';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';

/**
 * What the engine has to own about a covered scene change, which is the lifecycle and not the
 * shader.
 *
 * Three things are being pinned, and each of them is a bug somebody would otherwise ship:
 *
 * 1. The scene coming in **exists without being seen, updated or clicked on**. It exists so its
 *    loading can start; it is not seen because the screen is still showing the scene it replaces;
 *    it does not tick because a scene ticking behind a cover arrives at its first visible frame
 *    already several frames old.
 * 2. The swap waits for the **later** of two things: the screen being covered and the new scene
 *    having loaded. That is what makes a transition worth having twice over.
 * 3. It always comes off. Not slowed by `timeScale`, not stopped by a pause: a screen left covered
 *    has no menu visible to get out of it.
 */

// The loop schedules its next frame before doing anything else. Nothing here wants that frame, so
// it is answered and dropped: the tests drive the clock themselves.
(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const FRAME = 1 / 60;

/**
 * A game whose frames are driven by hand, at a fixed rate unless a test says otherwise.
 */
const drivenGame = () => {
    const canvas = createFakeCanvas(480, 320);
    const { store } = createTestGame({}, canvas);
    const ctx = createFrameContext();
    let now = 0;

    const frame = (step = FRAME): void => {
        const prev = now;
        now += step * 1000;
        tick(store, ctx, now, prev);
    };
    /**
     * Enough whole frames to cover `seconds`, which is how a cover actually finishes.
     */
    const frames = (seconds: number): void => {
        for (let left = seconds; left > 0; left -= FRAME) {
            frame();
        }
    };

    return { store, canvas, ctx, frame, frames };
};

/**
 * Two rooms and a handle on the first. `B` counts its own updates and puts one sprite on screen,
 * so "did it tick" and "was it drawn" are both answerable.
 */
const twoRooms = () => {
    const driven = drivenGame();
    const counted = { updates: 0, unmounted: 0 };

    registerScene(driven.store, 'B', () => {
        useUpdate(() => { counted.updates += 1; });
        createSprite({ width: 8, height: 8, tint: { r: 1, g: 1, b: 1, a: 1 }, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
        return createScene();
    });

    let handle!: TSceneHandle;
    startTestScene(driven.store, 'A', () => {
        handle = useScene();
        useSceneUnmount(() => { counted.unmounted += 1; });
        createSprite({ width: 8, height: 8, tint: { r: 1, g: 1, b: 1, a: 1 }, transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } });
        return createScene();
    });

    return { ...driven, counted, handle: () => handle };
};

/**
 * How many things the last frame handed the renderer.
 */
const drawnCount = (ctx: ReturnType<typeof createFrameContext>): number => ctx.passes[0].drawables?.length ?? 0;

describe('a scene held behind a transition', () => {
    it('is running from the moment of the change, and is the only one not drawn', () => {
        const { store, ctx, frame, counted, handle } = twoRooms();
        handle().change('B', { transition: fade(300) });

        const incoming = findScene(store, 'B');
        expect(incoming).toBeDefined();
        expect(incoming!.held).toBe(true);
        // Both are running: the one going out is still what the screen shows.
        expect(store.get('world').scenes).toHaveLength(2);

        frame();
        // One sprite, and it is A's. B exists and contributes nothing.
        expect(drawnCount(ctx)).toBe(1);
        expect(counted.updates).toBe(0);
    });

    it('does not answer the pointer, so it cannot act on a frame nobody saw', () => {
        const { store, canvas, frame, handle } = twoRooms();
        const seen: unknown[] = [];

        registerScene(store, 'C', () => {
            const pointer = usePointer();
            pointer.onDown((info) => { seen.push(info); });
            return createScene();
        });

        handle().change('C', { transition: fade(300) });
        canvas.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 0, clientY: 0, button: 0, pointerId: 1 }));
        frame();

        expect(seen).toHaveLength(0);
    });
});

describe('the swap', () => {
    it('happens once the screen is covered, and not before', () => {
        const { store, frames, counted, handle } = twoRooms();
        handle().change('B', { transition: fade(300) });

        // Half of 300ms is 150ms of cover. Just short of it, nothing has moved.
        frames(0.12);
        expect(findScene(store, 'A')).toBeDefined();
        expect(counted.unmounted).toBe(0);

        frames(0.06);
        expect(findScene(store, 'A')).toBeUndefined();
        expect(findScene(store, 'B')!.held).toBe(false);
        // The scene leaving runs its cleanups at the swap, not back when `change` was called: a
        // scene leaves when it stops being seen.
        expect(counted.unmounted).toBe(1);
        expect(counted.updates).toBeGreaterThan(0);
    });

    it('waits for the load even when the cover finished long ago', async () => {
        const { store, frames, handle } = twoRooms();
        const asset: { status: TLoadStatus } = { status: 'loading' };
        let arrive!: () => void;

        registerScene(store, 'Slow', () => {
            // Registered exactly the way a real loader registers one: on the scene's own list,
            // which is what `useLoader` counts, with its promise behind the same door.
            store.get('world').boxStack[0].loads.push(asset);
            trackLoad(asset, new Promise<void>((resolve) => {
                arrive = () => { asset.status = 'ready'; resolve(); };
            }));
            return createScene();
        });

        handle().change('Slow', { transition: fade(300) });
        frames(1);
        expect(store.get('transition').active!.phase).toBe('cover');
        expect(store.get('transition').active!.progress).toBe(1);
        expect(findScene(store, 'A')).toBeDefined();

        arrive();
        // The promise settles on a microtask, as it would from a real fetch.
        await Promise.resolve();
        frames(0.05);
        expect(findScene(store, 'A')).toBeUndefined();
    });
});

describe('the cover always comes off', () => {
    it('is not slowed by timeScale, and not stopped by a pause', () => {
        const { store, frames, handle } = twoRooms();
        store.setState('loop', { ...store.get('loop'), timeScale: 0, pausedBy: ['test'] });

        handle().change('B', { transition: fade(300) });
        frames(0.4);

        expect(store.get('transition').active).toBeNull();
        expect(findScene(store, 'A')).toBeUndefined();
        expect(findScene(store, 'B')).toBeDefined();
    });

    it('is still in the frame that reaches the end, and gone from the one after', () => {
        const { store, ctx, frame, handle } = twoRooms();
        handle().change('B', { transition: fade(300) });

        // Driven until it says it has finished rather than counted out in advance: how many whole
        // frames fit in 300ms is not the thing being pinned here.
        for (let i = 0; i < 60 && store.get('transition').active?.done !== true; i++) {
            frame();
        }
        const state = store.get('transition').active;
        expect(state).not.toBeNull();
        expect(state!.done).toBe(true);
        // The effect is still in the chain on the frame that finished, so the last thing anybody
        // saw was the cover fully gone rather than a few percent of it left behind.
        expect(ctx.post).toHaveLength(1);
        expect(ctx.progress).toBe(1);

        frame();
        expect(store.get('transition').active).toBeNull();
        expect(ctx.post).toBeUndefined();
    });
});

describe('a change that cannot be made', () => {
    it('is refused while another one is being covered, rather than stranding it', () => {
        const { store, frame, handle } = twoRooms();
        let other!: TSceneHandle;
        registerScene(store, 'D', () => createScene());

        handle().change('B', { transition: fade(300) });
        // A scene launched alongside holds its own handle and knows nothing about the change in
        // flight. Cutting now would leave that change with neither of its ends.
        startTestScene(store, 'Hud', () => {
            other = useScene();
            return createScene();
        });
        other.change('D');

        frame();
        expect(findScene(store, 'D')).toBeUndefined();
        expect(store.get('transition').active).not.toBeNull();
        expect(store.get('transition').active!.incoming.name).toBe('B');
    });

    it('will not let either end be stopped out from under it', () => {
        const { store, handle } = twoRooms();
        handle().change('B', { transition: fade(300) });

        expect(handle().stop('A')).toBe(false);
        expect(handle().stop('B')).toBe(false);
        expect(findScene(store, 'A')).toBeDefined();
        expect(findScene(store, 'B')).toBeDefined();
    });

    it('lets go of a transition whose end is torn down by the lower door', () => {
        const { store, handle } = twoRooms();
        handle().change('B', { transition: fade(300) });

        // `stopScene` is the door a destroyed game and a host loading another scene both go
        // through, and neither of those is polite enough to ask first.
        stopScene(store, 'B');

        expect(store.get('transition').active).toBeNull();
    });

    it('falls back to a hard cut when a scene restarts itself', () => {
        const { store, handle } = twoRooms();
        // Both copies would have to run at once for the old one to stay on screen, and a name
        // means one scene.
        handle().change('A', { transition: fade(300) });

        expect(store.get('transition').active).toBeNull();
        expect(findScene(store, 'A')).toBeDefined();
        expect(store.get('world').scenes).toHaveLength(1);
    });
});
