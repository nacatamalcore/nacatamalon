import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { tick } from '../src/game/loop/tick';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';

/**
 * The second argument of `useUpdate`: the seconds the scene has been running.
 *
 * It exists because forty-six examples each kept their own `elapsed += delta` to drive a sine or a
 * blink. The clock has to behave like `delta` in every way a game can tell apart, or a pulse would
 * go on beating under a pause menu.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

/**
 * A game whose frames are driven by hand, with one scene that writes down every `time` it is given.
 */
const driven = () => {
    const { store } = createTestGame({}, createFakeCanvas());
    const seen: number[] = [];
    const late: number[] = [];
    const Late = () => {
        useUpdate((_, time) => { late.push(time); });
    };
    let spawnLate!: () => void;
    const root = startTestScene(store, 'Only', () => {
        useUpdate((_, time) => { seen.push(time); });
        const spawn = useSpawn(Late);
        spawnLate = () => { spawn(); };
        return createScene();
    });
    const ctx = createFrameContext();
    let now = 0;

    return {
        store,
        root,
        seen,
        late,
        spawnLate: () => spawnLate(),
        frame: (seconds: number): void => {
            const prev = now;
            now += seconds * 1000;
            tick(store, ctx, now, prev);
        },
    };
};

describe('the scene clock', () => {
    it('adds up the frames, this one included', () => {
        const { seen, frame } = driven();
        frame(0.1);
        frame(0.05);

        expect(seen[0]).toBeCloseTo(0.1, 6);
        expect(seen[1]).toBeCloseTo(0.15, 6);
    });

    it('is game time: timeScale slows it and a pause of the game stops it', () => {
        const { store, seen, frame } = driven();
        frame(0.2);
        store.setState('loop', { ...store.get('loop'), timeScale: 0.5 });
        frame(0.2);
        expect(seen.at(-1)).toBeCloseTo(0.3, 6);

        store.setState('loop', { ...store.get('loop'), timeScale: 1, pausedBy: ['menu'] });
        frame(0.2);
        store.setState('loop', { ...store.get('loop'), pausedBy: [] });
        frame(0.1);
        expect(seen.at(-1)).toBeCloseTo(0.4, 6);
    });

    it('stops while its own scene is paused, and goes on from where it was', () => {
        const { root, seen, frame } = driven();
        frame(0.1);
        root.paused = true;
        frame(0.5);
        root.paused = false;
        frame(0.1);

        expect(seen).toHaveLength(2);
        expect(seen[1]).toBeCloseTo(0.2, 6);
    });

    it('is the same clock for something spawned later', () => {
        const { seen, late, spawnLate, frame } = driven();
        frame(0.1);
        spawnLate();
        frame(0.1);
        frame(0.1);

        // Two frames old, and it reads the scene's time (0.3), not its own age.
        expect(late).toHaveLength(2);
        expect(late.at(-1)).toBeCloseTo(seen.at(-1)!, 6);
        expect(late.at(-1)).toBeCloseTo(0.3, 6);
    });

    it('starts from zero in a scene that starts again', () => {
        const { store, frame } = driven();
        frame(0.5);

        const again: number[] = [];
        startTestScene(store, 'Again', () => {
            useUpdate((_, time) => { again.push(time); });
            return createScene();
        });
        frame(0.1);

        expect(again[0]).toBeCloseTo(0.1, 6);
    });
});
