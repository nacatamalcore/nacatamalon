import { describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { useUpdate } from '../src/hooks';
import { editorHandleOf, openHost } from '../src/game/handle/editor_handle_of';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TGameInstance } from '../src/game/types/t_game_instance';

/**
 * Running a paused game one frame at a time, which is what a Play window's "step" button does.
 *
 * Pinned: a step runs exactly one frame, by the time it was told and not by the clock, the game is
 * paused again afterwards, and a game that is running cannot be stepped.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const stepped = async () => {
    const { store } = createTestGame();
    const deltas: number[] = [];
    startTestScene(store, 'Level', () => {
        useUpdate((dt) => {
            deltas.push(dt);
        });
        return createScene();
    });
    const instance = { destroy: () => {} } as unknown as TGameInstance;
    openHost(instance).resolve(store);
    const handle = await editorHandleOf(instance);
    const ctx = createFrameContext();
    let now = 0;
    // Each frame arrives a whole second after the last: what the clock says is not what a step runs.
    const frame = () => {
        now += 1000;
        tick(store, ctx, now, now - 1000);
    };
    return { handle, deltas, frame };
};

describe('stepping a paused game', () => {
    it('runs one frame, by the time it was told, and stays paused', async () => {
        const { handle, deltas, frame } = await stepped();
        handle.pause('editor');
        frame();
        expect(deltas).toEqual([]);

        expect(handle.stepFrame(1 / 60)).toBe(true);
        frame();
        expect(deltas).toEqual([1 / 60]);

        frame();
        expect(deltas).toEqual([1 / 60]);
        expect(handle.isPaused()).toBe(true);
    });

    it('refuses a game that is running, which would be two frames in one', async () => {
        const { handle, deltas, frame } = await stepped();
        expect(handle.stepFrame()).toBe(false);
        frame();
        expect(deltas).toHaveLength(1);
    });
});

describe('what a host reads off a running game', () => {
    it('is its scenes and its actions', async () => {
        const { handle } = await stepped();
        expect(handle.getScenes().map((scene) => scene.name)).toEqual(['Level']);
        expect(handle.getActions().isDown('jump')).toBe(false);
    });
});
