import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { fade } from '../src/transition';
import { findScene } from '../src/scene/find_scene';
import { registerScene } from '../src/scene/register_scene';
import { stopScene } from '../src/scene/stop_scene';
import { tick } from '../src/game/loop/tick';
import { useScene } from '../src/hooks/scene/use_scene';
import { useReady } from '../src/hooks/scene/use_ready';
import { useSceneTransitionEnd } from '../src/hooks/scene/use_scene_transition_end';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';

/**
 * `useSceneTransitionEnd` is the moment a scene is in full view: after the cover a transition put
 * over it has come off, and before its update of that frame. Without a transition it is the first
 * frame, so a scene does the same whichever way it was brought in.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const FRAME = 1 / 60;

/**
 * Two rooms. `B` writes down, in order, its `useReady`, its updates and its transition's end, so
 * "when" can be read as "before what".
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
        for (let left = seconds; left > 0; left -= FRAME) frame();
    };

    const log: string[] = [];
    registerScene(store, 'B', () => {
        useReady(() => log.push('ready'));
        useSceneTransitionEnd(() => log.push('end'));
        useUpdate(() => log.push('update'));
        return createScene();
    });

    let handle!: TSceneHandle;
    startTestScene(store, 'A', () => {
        handle = useScene();
        return createScene();
    });

    return { store, frame, frames, log, handle: () => handle };
};

describe('useSceneTransitionEnd', () => {
    it('runs once the cover has come off, before that frame\'s update', () => {
        const { store, frame, frames, log, handle } = twoRooms();
        handle().change('B', { transition: fade(0.3) });
        expect(log).toEqual(['ready']);

        // Past the swap: B updates, uncovering, and its end has not come.
        frames(0.2);
        expect(findScene(store, 'A')).toBeUndefined();
        expect(log).toContain('update');
        expect(log).not.toContain('end');

        for (let i = 0; i < 60 && store.get('transition').active !== null; i++) frame();
        expect(store.get('transition').active).toBeNull();
        // The frame that took the cover away ran it, before its own update.
        expect(log.filter((entry) => entry === 'end')).toHaveLength(1);
        expect(log.at(-2)).toBe('end');
        expect(log.at(-1)).toBe('update');

        frames(0.1);
        expect(log.filter((entry) => entry === 'end')).toHaveLength(1);
    });

    it('runs on the first frame when the change has no transition', () => {
        const { frame, log, handle } = twoRooms();
        handle().change('B');
        expect(log).toEqual(['ready']);

        frame();
        expect(log).toEqual(['ready', 'end', 'update']);
    });

    it('waits while its scene is held with no transition yet, as behind the splash', () => {
        const { store, frame, log, handle } = twoRooms();
        handle().change('B');
        findScene(store, 'B')!.held = true;

        frame();
        expect(log).toEqual(['ready']);

        findScene(store, 'B')!.held = false;
        frame();
        expect(log).toEqual(['ready', 'end', 'update']);
    });

    it('never runs for a scene stopped before it was seen', () => {
        const { store, frames, log, handle } = twoRooms();
        handle().change('B', { transition: fade(0.3) });
        frames(0.05);
        // The door a host loading another scene goes through: the handle refuses to stop either end.
        stopScene(store, 'B');
        frames(0.5);

        expect(findScene(store, 'B')).toBeUndefined();
        expect(log).not.toContain('end');
        expect(store.get('world').transitionEnd).toHaveLength(0);
    });

    it('runs at the start of the next frame for something spawned once the scene is on screen', () => {
        const { store, frame } = twoRooms();
        const log: string[] = [];
        const Coin = () => {
            useSceneTransitionEnd(() => log.push('end'));
        };
        let spawned = false;
        startTestScene(store, 'C', () => {
            const spawn = useSpawn(Coin);
            useUpdate(() => {
                if (!spawned) {
                    spawned = true;
                    spawn();
                }
                log.push('update');
            });
            return createScene();
        });

        frame();
        expect(log).toEqual(['update']);
        frame();
        expect(log).toEqual(['update', 'end', 'update']);
    });

    it('lets one that throws cost only itself', () => {
        const { store, frame } = twoRooms();
        const log: string[] = [];
        const errors = console.error;
        console.error = () => {};
        try {
            startTestScene(store, 'C', () => {
                useSceneTransitionEnd(() => { throw new Error('boom'); });
                useSceneTransitionEnd(() => log.push('second'));
                return createScene();
            });
            frame();
        } finally {
            console.error = errors;
        }
        expect(log).toEqual(['second']);
    });

    it('is refused outside a scene body, a component or a script', () => {
        expect(() => useSceneTransitionEnd(() => {})).toThrow('useSceneTransitionEnd');
    });
});
