import { afterEach, describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { tick } from '../src/game/loop/tick';
import { useKeyboard } from '../src/hooks/input/use_keyboard';
import { useScene } from '../src/hooks/scene/use_scene';
import { useUpdate } from '../src/hooks/loop/use_update';
import { createFakeCanvas, createTestGame } from './helpers/test_game';

/**
 * What a scene change does to the frame it happens in, as `llms.txt` states it:
 *
 * - the key that triggered it does not reach the new scene as a fresh press, because the new scene's
 *   first update is the next frame, after presses are cleared;
 * - the old scene's remaining updates in that frame still run once, and never again.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const key = (type: 'keydown' | 'keyup', name: string): void => {
    globalThis.dispatchEvent(Object.assign(new Event(type), { key: name }));
};

afterEach(() => {
    key('keyup', ' ');
});

const drivenGame = () => {
    const { store } = createTestGame({}, createFakeCanvas(480, 320));
    const ctx = createFrameContext();
    let now = 0;
    const frame = (): void => {
        const prev = now;
        now += 1000 / 60;
        tick(store, ctx, now, prev);
    };
    return { store, frame };
};

describe('a scene change, in the frame it happens', () => {
    it('does not hand the key that caused it to the new scene as a fresh press', () => {
        const { store, frame } = drivenGame();
        const seenByEnd: boolean[] = [];
        registerScene(store, 'Title', () => {
            const keys = useKeyboard();
            const scene = useScene();
            useUpdate(() => {
                if (keys.justPressed('Space')) {
                    scene.change('End');
                }
            });
            return createScene();
        });
        registerScene(store, 'End', () => {
            const keys = useKeyboard();
            useUpdate(() => {
                seenByEnd.push(keys.justPressed('Space'));
            });
            return createScene();
        });
        startScene(store, 'Title');

        key('keydown', ' ');
        frame();
        frame();

        // The new scene's first update is the frame after the change, and the press is gone by then.
        expect(seenByEnd.length).toBeGreaterThan(0);
        expect(seenByEnd[0]).toBe(false);
    });

    it('lets the old scene finish that frame, and never runs it again', () => {
        const { store, frame } = drivenGame();
        let after = 0;
        let later = 0;
        registerScene(store, 'Level', () => {
            const scene = useScene();
            useUpdate(() => {
                scene.change('End');
                after += 1;
            });
            useUpdate(() => {
                later += 1;
            });
            return createScene();
        });
        registerScene(store, 'End', () => createScene());
        startScene(store, 'Level');

        frame();
        expect(after).toBe(1);
        expect(later).toBe(1);

        frame();
        frame();
        expect(after).toBe(1);
        expect(later).toBe(1);
    });
});
