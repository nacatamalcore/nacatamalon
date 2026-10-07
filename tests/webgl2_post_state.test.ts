import { describe, expect, it } from 'bun:test';
import { createPostPipelines } from '../src/render/webgl2/post/post_pipeline';
import { newPostEffect } from '../src/post/new_post_effect';
import { crt, dither, lcd } from '../src/post';
import type { TBuiltinPostEffect } from '../src/post';

/**
 * The state the screen effects leave GL in when they are done, which the next frame draws with.
 *
 * This file exists because of one bug that shipped. The chain used to finish by switching depth
 * testing back **on**. Nothing in a sprite draw switches it off again, because nothing else in this
 * backend leaves it on: every mesh, line and particle draw turns it off when it finishes. So from the
 * second frame on, a 2D scene with any effect drew its sprites against each other's depth, and of two
 * at the same depth the later one lost. The background survived and everything over it, the player,
 * the text, the HUD, was thrown away, on this card only.
 *
 * The first frame always looked right, because the chain had not run yet. A test that draws one
 * frame does not see it, and nothing in a compile or a console says anything. Hence a test of the
 * state itself.
 */

const DEPTH_TEST = 0x0b71;
const BLEND = 0x0be2;

/**
 * A context that records which capabilities are switched on, and agrees to everything else.
 */
const recordingGl = () => {
    const enabled = new Set<number>();
    const gl = new Proxy({
        DEPTH_TEST,
        BLEND,
        TEXTURE0: 0x84c0,
        enable: (cap: number) => { enabled.add(cap); },
        disable: (cap: number) => { enabled.delete(cap); },
        // Compiles and links, which is what a real card would say about the engine's own effects.
        getShaderParameter: () => true,
        getProgramParameter: () => true,
    } as Record<string, unknown>, {
        get: (target, key: string) => (key in target ? target[key] : () => ({})),
    }) as unknown as WebGL2RenderingContext;

    return { gl, enabled };
};

const effectOf = (built: TBuiltinPostEffect) => newPostEffect({ ...built }, null, 'scene');

/**
 * Runs a chain for a few frames, the way a game does, starting from the state a sprite pass leaves.
 */
const runFrames = (chain: ReturnType<typeof effectOf>[], frames: number) => {
    const { gl, enabled } = recordingGl();
    const post = createPostPipelines(gl);
    for (let frame = 0; frame < frames; frame++) {
        // A sprite pass draws with blending on and depth testing off.
        enabled.add(BLEND);
        enabled.delete(DEPTH_TEST);
        post.sceneTarget(320, 224);
        post.run(chain, null, frame / 60, 0, 0, 1);
    }
    return enabled;
};

describe('the state the effects leave behind on WebGL2', () => {
    it('leaves depth testing off, the way every other draw in this backend does', () => {
        const enabled = runFrames([effectOf(dither())], 2);

        expect(enabled.has(DEPTH_TEST)).toBe(false);
        // Blending is the other half of what a sprite expects, and the chain turns it off to draw.
        expect(enabled.has(BLEND)).toBe(true);
    });

    it('leaves it off after an effect with passes and one that remembers the last frame', () => {
        const enabled = runFrames([effectOf(lcd()), effectOf(crt())], 3);

        expect(enabled.has(DEPTH_TEST)).toBe(false);
        expect(enabled.has(BLEND)).toBe(true);
    });
});
