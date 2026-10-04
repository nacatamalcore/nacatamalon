import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { useUpdate } from '../src/hooks';
import { createTestGame, startTestScene } from './helpers/test_game';

/**
 * A scene whose update throws, in a game that goes on running.
 *
 * The loop does not stop: the scene that threw loses the rest of its update, the others carry on,
 * and the frame is drawn. What is pinned is that the error is said **once** however many frames it
 * keeps happening, and that it is kept where a tool can see it and clear it.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

let quiet: ReturnType<typeof spyOn> | null = null;
afterEach(() => {
    quiet?.mockRestore();
    quiet = null;
});

const game = () => {
    const { store, renderer } = createTestGame();
    let drawn = 0;
    renderer.frame = () => {
        drawn++;
    };
    let healthy = 0;
    startTestScene(store, 'Broken', () => {
        useUpdate(() => {
            throw new Error('a typo in a script');
        });
        return createScene();
    });
    startTestScene(store, 'Healthy', () => {
        useUpdate(() => {
            healthy++;
        });
        return createScene();
    });
    const ctx = createFrameContext();
    let now = 0;
    const frame = () => {
        const prev = now;
        now += 16;
        tick(store, ctx, now, prev);
    };
    return { store, frame, drawn: () => drawn, healthy: () => healthy };
};

describe('a scene update that throws', () => {
    it('costs its own scene, not the others and not the picture', () => {
        quiet = spyOn(console, 'error').mockImplementation(() => {});
        const { frame, drawn, healthy } = game();
        frame();
        frame();

        expect(healthy()).toBe(2);
        expect(drawn()).toBe(2);
    });

    it('is said once, and kept, however many frames it keeps happening', () => {
        quiet = spyOn(console, 'error').mockImplementation(() => {});
        const { store, frame } = game();
        for (let i = 0; i < 5; i++) frame();

        expect(quiet.mock.calls.length).toBe(1);
        expect(store.get('loop').failure?.message).toBe('a typo in a script');
    });

    it('is said again once it has been cleared, since the next one is news', () => {
        quiet = spyOn(console, 'error').mockImplementation(() => {});
        const { store, frame } = game();
        frame();
        store.setState('loop', { failure: null });
        frame();

        expect(quiet.mock.calls.length).toBe(2);
    });
});
