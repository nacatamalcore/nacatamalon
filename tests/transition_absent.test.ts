import { describe, expect, it } from 'bun:test';
import { buildPostChain } from '../src/post/build_post_chain';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { createScene } from '../src/scene/create_scene';
import { dither } from '../src/post';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { findScene } from '../src/scene/find_scene';
import { registerScene } from '../src/scene/register_scene';
import { useScene } from '../src/hooks/scene/use_scene';
import { usePostProcess } from '../src/hooks/post/use_post_process';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TSceneHandle } from '../src/hooks/scene/use_scene';

/**
 * What a scene change costs when nobody asked for a transition, which has to be nothing.
 *
 * Every game written before transitions existed calls `change` with one argument, and almost every
 * game written after this will too. The thing being pinned is that the second argument bought them
 * nothing: the cut still happens inside the call, and the frame still reaches the backend with no
 * chain at all, so nothing is copied and no picture is made in between.
 */

const twoScenes = () => {
    const { store } = createTestGame();
    registerScene(store, 'B', () => createScene());

    let handle!: TSceneHandle;
    startTestScene(store, 'A', () => {
        handle = useScene();
        return createScene();
    });
    return { store, handle: () => handle };
};

describe('a change with no transition', () => {
    it('is still the hard cut it always was, inside the call', () => {
        const { store, handle } = twoScenes();
        handle().change('B');

        // No frame has been drawn and it is already done: nothing is held, nothing is waiting.
        expect(findScene(store, 'A')).toBeUndefined();
        expect(findScene(store, 'B')).toBeDefined();
        expect(findScene(store, 'B')!.held).toBe(false);
        expect(store.get('transition').active).toBeNull();
    });

    it('leaves the chain undefined, so no picture is made in between', () => {
        const { store, handle } = twoScenes();
        handle().change('B');

        const ctx = createFrameContext();
        fillFrameContext(store, ctx);

        expect(buildPostChain(store)).toBeNull();
        expect(ctx.post).toBeUndefined();
        expect(ctx.progress).toBe(0);
        expect(ctx.phase).toBe(0);
    });

    it('does not add itself to a chain a game already had', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Only', () => {
            usePostProcess({ ...dither({ levels: 4 }) });
            return createScene();
        });

        const chain = buildPostChain(store);
        expect(chain).toHaveLength(1);
        expect(chain![0].source).toBe('scene');
    });
});
