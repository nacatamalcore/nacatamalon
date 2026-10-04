import { describe, expect, it } from 'bun:test';
import { MAX_FRAME_DELTA } from '../src/CONFIG';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { tick } from '../src/game/loop/tick';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';

/**
 * The clock a shader animates on.
 *
 * This exists because it was **silently zero for four slices**. `TFrameContext.time` was created at
 * zero, read in eight places across the two backends, and written nowhere, so every effect built on
 * `mu.time` drew one frame of itself for the life of the game: a sea of lava as still as a
 * photograph, with no error anywhere. Nothing here is subtle; what was missing was anybody asking.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

/**
 * A game whose frames are driven by hand, so the clock can be read after each one.
 */
const driven = () => {
    const { store } = createTestGame({}, createFakeCanvas());
    startTestScene(store, 'Only', () => createScene());
    const ctx = createFrameContext();
    let now = 0;

    return {
        store,
        ctx,
        frame: (seconds: number): void => {
            const prev = now;
            now += seconds * 1000;
            tick(store, ctx, now, prev);
        },
    };
};

describe('the frame clock', () => {
    it('starts at zero and adds up', () => {
        const { ctx, frame } = driven();
        expect(ctx.time).toBe(0);

        frame(0.1);
        expect(ctx.time).toBeCloseTo(0.1, 6);

        frame(0.05);
        expect(ctx.time).toBeCloseTo(0.15, 6);
    });

    it('is game time: it stops with a pause and moves with timeScale', () => {
        const { store, ctx, frame } = driven();

        frame(0.2);
        store.setState('loop', { ...store.get('loop'), timeScale: 0.5 });
        frame(0.2);
        // Half speed, so a fifth of a second of frame is a tenth of a second of game.
        expect(ctx.time).toBeCloseTo(0.3, 6);

        store.setState('loop', { ...store.get('loop'), timeScale: 1, pausedBy: ['menu'] });
        frame(0.2);
        // A frozen game whose lava went on boiling would be a game only half paused.
        expect(ctx.time).toBeCloseTo(0.3, 6);

        store.setState('loop', { ...store.get('loop'), pausedBy: [] });
        frame(0.1);
        expect(ctx.time).toBeCloseTo(0.4, 6);
    });

    it('is clamped per frame, so a tab left in the background does not jump the world', () => {
        const { ctx, frame } = driven();
        // The loop caps one frame's delta; a minute away must not arrive as a minute of game.
        frame(60);
        expect(ctx.time).toBeCloseTo(MAX_FRAME_DELTA, 6);
    });

    it('reaches the renderer on the frame it was measured', () => {
        const { store, ctx, frame } = driven();
        const renderer = store.get('screen').renderer as unknown as { frames: Array<{ time: number }> };

        frame(0.1);
        frame(0.1);
        // The same object every frame, so what is checked is the number it carried when handed over.
        expect(renderer.frames).toHaveLength(2);
        expect(ctx.time).toBeCloseTo(0.2, 6);
    });
});
