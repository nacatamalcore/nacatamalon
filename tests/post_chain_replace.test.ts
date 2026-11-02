import { afterEach, describe, expect, it } from 'bun:test';
import { replaceProjectPostChain, tuneProjectPostEffect } from '../src/post/install_post_chain';
import { usePostProcess } from '../src/hooks/post/use_post_process';
import { useMotion } from '../src/hooks/motion/use_motion';
import { parseMotionDoc } from '../src/motion';
import { runHookUpdates } from '../src/game/loop/runHookUpdates';
import { DOCUMENTS } from '../src/CONST';
import { createScene } from '../src/scene/create_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TPostChainEntry } from '../src/post';

/**
 * Changing the project's chain while the game runs, which is what the editor does when an effect is
 * moved, added or taken out.
 */

const FRAGMENT = 'fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return color; }';
const A: TPostChainEntry = { builtin: 'colorAdjust', name: 'a', uniforms: { brightness: 0.5 } };
const B: TPostChainEntry = { builtin: 'grain', name: 'b' };
const FILE: TPostChainEntry = { effect: 'mine.wgsl', name: 'file' };

const answered = globalThis.fetch;
afterEach(() => { globalThis.fetch = answered; });

const running = () => {
    const { store } = createTestGame();
    globalThis.fetch = (async () => new Response(FRAGMENT)) as unknown as typeof fetch;
    return {
        store,
        names: () => store.get('post').effects.map((effect) => effect.name),
    };
};

describe('changing the project\'s post chain', () => {
    it('moves an effect, and a scene\'s own stay behind the project\'s', () => {
        const { store, names } = running();
        replaceProjectPostChain(store, [A, B]);
        startTestScene(store, 'Level', () => {
            usePostProcess({ name: 'scene', fragment: FRAGMENT });
            return createScene();
        });
        expect(names()).toEqual(['a', 'b', 'scene']);

        replaceProjectPostChain(store, [B, A]);
        expect(names()).toEqual(['b', 'a', 'scene']);
    });

    it('tunes by the place an effect has now', () => {
        const { store } = running();
        replaceProjectPostChain(store, [A, B]);
        replaceProjectPostChain(store, [B, A]);

        expect(tuneProjectPostEffect(store, 1, { brightness: 0.25 })).toBe(true);
        const moved = store.get('post').effects.find((effect) => effect.name === 'a')!;
        expect((moved.uniforms as Record<string, unknown>).brightness).toBe(0.25);
    });

    it('keeps on its file only the effects still in the chain, however often it changes', () => {
        const { store, names } = running();
        replaceProjectPostChain(store, [FILE, A]);
        const shader = [...store.get('assets').shaders.values()][0]!;
        for (let i = 0; i < 10; i++) {
            replaceProjectPostChain(store, [A, FILE]);
        }

        expect(names()).toEqual(['a', 'file']);
        expect(shader.bound).toEqual([store.get('post').effects[1]!]);
    });

    it('leaves on the file an effect of a scene that reads it too', () => {
        const { store } = running();
        replaceProjectPostChain(store, [FILE]);
        startTestScene(store, 'Level', () => {
            usePostProcess({ name: 'scene', effect: 'mine.wgsl' });
            return createScene();
        });
        const shader = [...store.get('assets').shaders.values()][0]!;
        replaceProjectPostChain(store, []);

        expect(shader.bound.map((effect) => (effect as { name: string }).name)).toEqual(['scene']);
    });

    it('moves on with a motion moving one of them, rather than the one that is gone', () => {
        const { store } = running();
        replaceProjectPostChain(store, [A, B]);
        const doc = parseMotionDoc({
            format: DOCUMENTS.MOTION.FORMAT,
            version: DOCUMENTS.MOTION.VERSION,
            duration: 1,
            events: [],
            tracks: [{ post: 'a', path: 'uniforms.brightness', keys: [{ t: 0, v: 0 }, { t: 1, v: 1 }] }],
        }, 'test.motion');
        const scene = startTestScene(store, 'Level', () => {
            useMotion(doc).play();
            return createScene();
        });
        const brightness = () => (store.get('post').effects.find((effect) => effect.name === 'a')!.uniforms as Record<string, number>).brightness;
        runHookUpdates(scene, 0);
        runHookUpdates(scene, 0.25);
        expect(brightness()).toBeCloseTo(0.25, 5);

        replaceProjectPostChain(store, [B, A]);
        runHookUpdates(scene, 0.25);
        expect(brightness()).toBeCloseTo(0.5, 5);
    });
});
