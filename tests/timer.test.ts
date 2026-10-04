import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { tick } from '../src/game/loop/tick';
import { useTimer } from '../src/hooks/timer/use_timer';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { destroy } from '../src/destroy/destroy';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TTimer } from '../src/hooks/timer/types/t_timer';
import type { TGameObject } from '../src';

/**
 * `useTimer`: running something later, in game time.
 *
 * The three things a `setTimeout` gets wrong in a game are what is pinned here: it goes on during a
 * pause, it ignores `timeScale`, and it fires into a scene that has already ended.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

/**
 * A game driven by hand, with one scene holding a timer the test can schedule on.
 */
const driven = () => {
    const { store } = createTestGame({}, createFakeCanvas());
    let timer!: TTimer;
    const root = startTestScene(store, 'Only', () => {
        timer = useTimer();
        return createScene();
    });
    const ctx = createFrameContext();
    let now = 0;
    return {
        store,
        root,
        timer,
        frame: (seconds: number): void => {
            const prev = now;
            now += seconds * 1000;
            tick(store, ctx, now, prev);
        },
    };
};

describe('useTimer', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useTimer()).toThrow('[NacatamalOn] useTimer');
    });

    it('runs an after once, when its time comes', () => {
        const { timer, frame } = driven();
        let runs = 0;
        const handle = timer.after(0.25, () => { runs += 1; });

        frame(0.1);
        frame(0.1);
        expect(runs).toBe(0);
        frame(0.1);
        expect(runs).toBe(1);
        expect(handle.done).toBe(true);
        frame(1);
        expect(runs).toBe(1);
    });

    it('runs an every again and again, and a short one more than once in a long frame', () => {
        const { timer, frame } = driven();
        let runs = 0;
        const handle = timer.every(0.1, () => { runs += 1; });

        frame(0.05);
        expect(runs).toBe(0);
        frame(0.06);
        expect(runs).toBe(1);
        // A quarter of a second in one frame owes it two more runs, not one.
        frame(0.2);
        expect(runs).toBe(3);
        expect(handle.done).toBe(false);

        handle.cancel();
        frame(1);
        expect(runs).toBe(3);
        expect(handle.done).toBe(true);
    });

    it('is game time: a pause stops it and timeScale stretches it', () => {
        const { store, root, timer, frame } = driven();
        let runs = 0;
        timer.after(0.2, () => { runs += 1; });

        store.setState('loop', { ...store.get('loop'), pausedBy: ['menu'] });
        frame(0.5);
        store.setState('loop', { ...store.get('loop'), pausedBy: [] });
        root.paused = true;
        frame(0.5);
        root.paused = false;
        expect(runs).toBe(0);

        // Half speed: 0.3 s of frames is 0.15 s of game, short of the 0.2 it waits; one more frame is not.
        store.setState('loop', { ...store.get('loop'), timeScale: 0.5 });
        frame(0.15);
        frame(0.15);
        expect(runs).toBe(0);
        frame(0.15);
        expect(runs).toBe(1);
    });

    it('keeps the order of a sequence even when one long frame covers several steps', () => {
        const { timer, frame } = driven();
        const order: string[] = [];
        timer.after(0.15, () => { order.push('third'); });
        timer.after(0.05, () => { order.push('first'); });
        timer.after(0.1, () => { order.push('second'); });

        // One frame of a fifth of a second covers all three (the loop caps a frame at a quarter).
        frame(0.2);
        expect(order).toEqual(['first', 'second', 'third']);
    });

    it('lets a step call off a later one due in the same frame', () => {
        const { timer, frame } = driven();
        const order: string[] = [];
        let later!: { cancel(): void };
        timer.after(0.1, () => { order.push('first'); later.cancel(); });
        later = timer.after(0.2, () => { order.push('never'); });

        frame(0.5);
        expect(order).toEqual(['first']);
    });

    it('runs a step scheduled from inside another on a later frame, even with no wait', () => {
        const { timer, frame } = driven();
        const order: string[] = [];
        timer.after(0.1, () => {
            order.push('first');
            timer.after(0, () => { order.push('next'); });
        });

        frame(0.2);
        expect(order).toEqual(['first']);
        frame(0.01);
        expect(order).toEqual(['first', 'next']);
    });

    it('cancels everything at once, which is how a sequence starts over', () => {
        const { timer, frame } = driven();
        let runs = 0;
        timer.after(0.1, () => { runs += 1; });
        timer.every(0.1, () => { runs += 1; });
        timer.cancelAll();

        frame(1);
        expect(runs).toBe(0);
    });

    it('refuses an every with no time between calls, which would never end', () => {
        const { timer } = driven();
        expect(() => timer.every(0, () => {})).toThrow('more than zero');
    });

    it('goes with the object that asked for it', () => {
        const { store } = createTestGame({}, createFakeCanvas());
        let runs = 0;
        let child!: TGameObject;
        const Ticker = () => {
            useTimer().every(0.1, () => { runs += 1; });
        };
        startTestScene(store, 'Only', () => {
            child = useSpawn(Ticker)();
            return createScene();
        });
        const ctx = createFrameContext();
        tick(store, ctx, 150, 0);
        expect(runs).toBe(1);

        destroy(child);
        tick(store, ctx, 1150, 150);
        expect(runs).toBe(1);
    });
});
