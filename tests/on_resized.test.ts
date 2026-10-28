import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { rememberScreenSize } from '../src/DOM/screen_size';
import { stopScene } from '../src/scene/stop_scene';
import { tick } from '../src/game/loop/tick';
import { useGame } from '../src/hooks/game/use_game';
import { useUpdate } from '../src/hooks/loop/use_update';
import { createFakeCanvas, createTestGame, startTestScene } from './helpers/test_game';
import type { TGameResizeEvent } from '../src/game/handle';

/**
 * `onResized` is the game's size changing, seen at the start of a frame: once a change, before any
 * update, and never for a change of density alone.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const resizable = () => {
    const canvas = createFakeCanvas(480, 270);
    const { store } = createTestGame({}, canvas);
    const ctx = createFrameContext();
    let now = 0;
    const frame = (): void => {
        const prev = now;
        now += 1000 / 60;
        tick(store, ctx, now, prev);
    };
    // What a fit writes when the container changes: the game's size, in its own pixels.
    const resize = (width: number, height: number, pixelRatio = 1): void => {
        rememberScreenSize(canvas, { width, height, pixelRatio });
    };

    const log: Array<TGameResizeEvent | 'update'> = [];
    startTestScene(store, 'Level', () => {
        useGame().onResized((size) => log.push(size));
        useUpdate(() => log.push('update'));
        return createScene();
    });

    return { store, frame, resize, log };
};

describe('useGame().onResized', () => {
    it('is not heard at the start, when nothing has changed', () => {
        const { frame, log } = resizable();
        frame();
        frame();
        expect(log).toEqual(['update', 'update']);
    });

    it('is heard once a change, with the new size, before the frame\'s updates', () => {
        const { frame, resize, log } = resizable();
        frame();
        log.length = 0;

        // A window drag says so many times between two frames: one change, the size it ended at.
        resize(500, 270);
        resize(560, 270);
        frame();
        frame();

        expect(log).toEqual([{ width: 560, height: 270 }, 'update', 'update']);
    });

    it('is not heard when only the density changes', () => {
        const { frame, resize, log } = resizable();
        resize(480, 270, 1);
        frame();
        log.length = 0;

        resize(480, 270, 2);
        frame();
        expect(log).toEqual(['update']);
    });

    it('is heard while the game is paused, so a pause menu fits too', () => {
        const { store, frame, resize, log } = resizable();
        frame();
        store.setState('loop', { ...store.get('loop'), pausedBy: ['menu'] });
        log.length = 0;

        resize(640, 360);
        frame();
        expect(log).toEqual([{ width: 640, height: 360 }]);
    });

    it('leaves with the scene that listened', () => {
        const { store, frame, resize, log } = resizable();
        frame();
        stopScene(store, 'Level');
        log.length = 0;

        resize(640, 360);
        frame();
        expect(log).toEqual([]);
    });
});
