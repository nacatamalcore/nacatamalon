import { describe, expect, it } from 'bun:test';
import { buildPostChain } from '../src/post/build_post_chain';
import { createScene } from '../src/scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import { dither } from '../src/post';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { usePostProcess } from '../src/hooks/post/use_post_process';
import type { TFrameContext } from '../src/render/interface';

/**
 * What a game with no screen-wide effects costs, which has to be nothing.
 *
 * Every other test here asks whether the new thing works. This one asks whether the old thing still
 * does, and it is the more valuable question: every 2D game that existed before any of this was
 * written goes down this path, and most of them will never ask for an effect.
 *
 * The thing being pinned is one distinction: the chain is **`null`, never an empty list**. The
 * backends only enter their post path when it is a list, so an empty one would be a branch that can
 * be entered by accident, and the accident would be an extra full-screen copy in every game.
 */

/**
 * Runs a body inside a scene and hands back what it built, which a scene body cannot return.
 */
const inScene = <T>(store: Parameters<typeof startTestScene>[0], name: string, body: () => T): T => {
    let made!: T;
    startTestScene(store, name, () => {
        made = body();
        return createScene();
    });
    return made;
};

const frameOf = (store: Parameters<typeof fillFrameContext>[0]): TFrameContext => {
    const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
    fillFrameContext(store, ctx);
    return ctx;
};

describe('a game that never asks for an effect', () => {
    it('has no chain at all, rather than an empty one', () => {
        const { store } = createTestGame();

        expect(buildPostChain(store)).toBeNull();
    });

    it('leaves the frame with no post field, which is what the backends branch on', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => createScene());

        const ctx = frameOf(store);

        expect(ctx.post).toBeUndefined();
        expect('post' in ctx).toBe(false);
    });

    it('still says which pass a person is looking at, whether or not anything is laid over it', () => {
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => createScene());

        // The flag describes the pass, not the feature: a capture wants the effects and a sprite
        // drawn into a texture does not, and neither can be told from the other by where it draws.
        expect(frameOf(store).passes[0]!.postProcess).toBe(true);
    });
});

describe('a chain that exists but cannot run', () => {
    it('costs exactly what no chain costs when every effect is switched off', () => {
        const { store } = createTestGame();
        inScene(store, 'Level', () => usePostProcess({ ...dither(), enabled: false }));

        expect(buildPostChain(store)).toBeNull();
        expect(frameOf(store).post).toBeUndefined();
    });

    it('costs the same when the whole lot is switched off at once', () => {
        const { store } = createTestGame();
        inScene(store, 'Level', () => usePostProcess({ ...dither() }));
        store.setState('post', { enabled: false });

        expect(buildPostChain(store)).toBeNull();
    });

    it('costs the same while an effect is still waiting for its file', () => {
        const { store } = createTestGame();
        // No hook yet is what an effect looks like before its shader lands. It must not turn the
        // post path on, or a scene would pay for a copy of the screen to run nothing over it.
        const effect = inScene(store, 'Level', () => usePostProcess({ ...dither() }));
        effect.fragment = null;

        expect(buildPostChain(store)).toBeNull();
    });

    it('drops the ones that cannot run and keeps the rest, rather than all or nothing', () => {
        const { store } = createTestGame();
        const { off, on } = inScene(store, 'Level', () => ({
            off: usePostProcess({ ...dither(), enabled: false }),
            on: usePostProcess({ ...dither() }),
        }));

        expect(buildPostChain(store)).toEqual([on]);
        expect(off.enabled).toBe(false);
    });
});
