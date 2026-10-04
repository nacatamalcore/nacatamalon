import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { stopScene } from '../src/scene/stop_scene';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { useTween } from '../src/hooks/tween/use_tween';
import { easeInQuad, linear } from '../src/math/easing';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TTweenStarter } from '../src/hooks/tween/types/t_tween';
import type { TRuntimeStore } from '../src/store';

/**
 * A scene whose only job is to hold a tween starter, plus a hand-cranked clock. No renderer runs
 * here: `runHookUpdates` is exactly what the loop calls, so a test frame and a real one are the
 * same call with a delta the test chooses.
 */
const scened = (): { tween: TTweenStarter; tick: (seconds: number) => void; store: TRuntimeStore; root: TBox } => {
    const { store } = createTestGame();
    let tween!: TTweenStarter;

    const root = startTestScene(store, 'Level', () => {
        tween = useTween();
        return createScene();
    });

    return { tween, tick: (seconds: number) => runHookUpdates(root, seconds), store, root };
};

/**
 * Collects every value a tween reports, so a whole trip can be read at the end.
 */
const recorder = () => {
    const values: number[] = [];
    return { values, onUpdate: (value: number) => { values.push(value); } };
};

describe('useTween', () => {
    it('refuses to be called outside a scene body', () => {
        expect(() => useTween()).toThrow('[NacatamalOn] useTween');
    });

    it('carries the value from one end to the other', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate });

        tick(0.5);
        expect(seen.values.at(-1)).toBeCloseTo(50, 10);
    });

    it('lands exactly on the destination once the time is up', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 1, duration: 1, onUpdate: seen.onUpdate });

        // Ten frames of a tenth of a second do not add up to one second: 0.1 cannot be written
        // exactly in binary, so the clock lands a hair short and the value with it. What is
        // promised is that it never goes past the destination...
        for (let i = 0; i < 10; i += 1) {
            tick(0.1);
        }
        expect(seen.values.at(-1)).toBeLessThanOrEqual(1);
        expect(seen.values.at(-1)).toBeCloseTo(1, 10);

        // ...and that the moment the clock does reach the duration, the value is the destination
        // itself and not something near it. That is why it is worked out from the two ends every
        // frame instead of being added up.
        tick(0.1);
        expect(seen.values.at(-1)).toBe(1);
    });

    it('does not overshoot when a frame runs long', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 100, duration: 0.2, onUpdate: seen.onUpdate });
        tick(5);

        expect(seen.values.at(-1)).toBe(100);
    });

    it('bends the trip through the easing curve', () => {
        const { tween, tick } = scened();
        const straight = recorder();
        const bent = recorder();

        tween({ from: 0, to: 100, duration: 1, ease: linear, onUpdate: straight.onUpdate });
        tween({ from: 0, to: 100, duration: 1, ease: easeInQuad, onUpdate: bent.onUpdate });
        tick(0.5);

        expect(straight.values.at(-1)).toBeCloseTo(50, 10);
        expect(bent.values.at(-1)).toBeCloseTo(25, 10);
    });

    it('waits out its delay before moving', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 100, duration: 1, delay: 0.3, onUpdate: seen.onUpdate });

        tick(0.2);
        expect(seen.values).toEqual([]);

        tick(0.2);
        // Only the 0.1 left over after the delay counts as movement, not the whole frame.
        expect(seen.values.at(-1)).toBeCloseTo(10, 10);
    });

    it('runs one extra time with repeat: 1', () => {
        const { tween, tick } = scened();
        let completed = 0;

        tween({ from: 0, to: 10, duration: 1, repeat: 1, onUpdate: () => {}, onComplete: () => { completed += 1; } });

        tick(1);
        expect(completed).toBe(0);

        tick(1);
        expect(completed).toBe(1);
    });

    it('never ends with a negative repeat', () => {
        const { tween, tick } = scened();
        let completed = 0;

        const handle = tween({
            from: 0, to: 10, duration: 0.1, repeat: -1,
            onUpdate: () => {},
            onComplete: () => { completed += 1; },
        });

        for (let i = 0; i < 100; i += 1) {
            tick(0.1);
        }

        expect(completed).toBe(0);
        expect(handle.done).toBe(false);
    });

    it('comes back the other way with yoyo', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 100, duration: 1, repeat: 1, yoyo: true, onUpdate: seen.onUpdate });

        tick(1);
        expect(seen.values.at(-1)).toBe(100);

        tick(0.5);
        expect(seen.values.at(-1)).toBeCloseTo(50, 10);

        tick(0.5);
        expect(seen.values.at(-1)).toBe(0);
    });

    it('announces the end once and only once', () => {
        const { tween, tick } = scened();
        let completed = 0;

        tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {}, onComplete: () => { completed += 1; } });

        tick(0.5);
        tick(0.5);
        tick(0.5);

        expect(completed).toBe(1);
    });

    it('stops in silence when cancelled', () => {
        const { tween, tick } = scened();
        const seen = recorder();
        let completed = 0;

        const handle = tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate, onComplete: () => { completed += 1; } });

        tick(0.5);
        const atCancel = seen.values.length;
        handle.cancel();
        tick(0.5);

        expect(handle.done).toBe(true);
        expect(completed).toBe(0);
        expect(seen.values.length).toBe(atCancel);
    });

    it('jumps to the end and announces it when finished', () => {
        const { tween } = scened();
        const seen = recorder();
        let completed = 0;

        const handle = tween({ from: 0, to: 100, duration: 10, onUpdate: seen.onUpdate, onComplete: () => { completed += 1; } });
        handle.finish();

        expect(seen.values.at(-1)).toBe(100);
        expect(completed).toBe(1);
        expect(handle.done).toBe(true);
    });

    it('does not announce twice if finished after it already ended', () => {
        const { tween, tick } = scened();
        let completed = 0;

        const handle = tween({ from: 0, to: 1, duration: 0.5, onUpdate: () => {}, onComplete: () => { completed += 1; } });

        tick(0.5);
        handle.finish();

        expect(completed).toBe(1);
    });

    it('freezes on pause and picks up where it left off', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        const handle = tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate });

        tick(0.25);
        handle.pause();
        tick(10);
        expect(seen.values.at(-1)).toBeCloseTo(25, 10);

        // From where it stopped, not from where the clock would have taken it.
        handle.resume();
        tick(0.25);
        expect(seen.values.at(-1)).toBeCloseTo(50, 10);
    });

    it('delivers the destination at once with no duration', () => {
        const { tween, tick } = scened();
        const seen = recorder();

        tween({ from: 0, to: 42, duration: 0, onUpdate: seen.onUpdate });
        tick(0.016);

        expect(seen.values).toEqual([42]);
    });

    it('starts a tween chained from onComplete on the next frame, not this one', () => {
        const { tween, tick } = scened();
        const second = recorder();

        tween({
            from: 0, to: 1, duration: 0.5,
            onUpdate: () => {},
            onComplete: () => {
                tween({ from: 100, to: 200, duration: 1, onUpdate: second.onUpdate });
            },
        });

        tick(0.5);
        expect(second.values).toEqual([]);

        tick(0.5);
        expect(second.values.at(-1)).toBeCloseTo(150, 10);
    });

    it('goes away with its scene', () => {
        const { tween, store } = scened();
        const seen = recorder();

        // Driven the way the loop drives it, over the list of running scenes, because that list
        // is the whole of the cleanup: a stopped scene is not updated because it is no longer on
        // it, and its tweens stop with it without anything being unregistered.
        const frame = (seconds: number) => {
            for (const scene of [...store.get('world').scenes]) {
                runHookUpdates(scene, seconds);
            }
        };

        tween({ from: 0, to: 100, duration: 1, onUpdate: seen.onUpdate });
        frame(0.5);
        const atStop = seen.values.length;

        stopScene(store, 'Level');
        frame(0.5);

        expect(store.get('world').scenes).toHaveLength(0);
        expect(seen.values.length).toBe(atStop);
    });

    it('keeps the tweens of two scenes apart', () => {
        const { store } = createTestGame();
        const first = recorder();
        const second = recorder();

        const menu = startTestScene(store, 'Menu', () => {
            useTween()({ from: 0, to: 100, duration: 1, onUpdate: first.onUpdate });
            return createScene();
        });
        startTestScene(store, 'Level', () => {
            useTween()({ from: 0, to: 100, duration: 1, onUpdate: second.onUpdate });
            return createScene();
        });

        runHookUpdates(menu, 0.5);

        expect(first.values.at(-1)).toBeCloseTo(50, 10);
        expect(second.values).toEqual([]);
    });
});
