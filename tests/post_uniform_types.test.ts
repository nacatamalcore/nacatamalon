import { describe, expect, it } from 'bun:test';
import { createScene } from '../src/scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import { crt, dither } from '../src/post';
import { usePostProcess } from '../src/hooks/post/use_post_process';
import type { TPostEffect } from '../src/post/types/t_post_effect';

/**
 * An effect's knobs keep their names and their kind on the way through `usePostProcess`.
 *
 * Most of what this checks is checked by the compiler, not by the runner: `bun run typecheck` covers
 * `tests/`, and every `@ts-expect-error` here must still be an error or the typecheck fails. Before
 * this, `effect.uniforms` was a bag of `number | number[]`, so four examples wrote
 * `Number(effect.uniforms.levels)` to read back a number they had just written.
 */

describe('the knobs of an effect', () => {
    it('come back by name and as numbers, from a built-in and from a hand-written one', () => {
        const { store } = createTestGame();
        let banded!: TPostEffect<{ levels: number; strength: number }>;
        let curved!: ReturnType<typeof usePostProcess<{ curve: number }>>;
        let tube!: ReturnType<typeof usePostProcess<ReturnType<typeof crt>['uniforms']>>;
        startTestScene(store, 'Level', () => {
            banded = usePostProcess(dither({ levels: 4 }));
            curved = usePostProcess({ fragment: 'fn effect(c: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return c; }', uniforms: { curve: 0.3 } });
            tube = usePostProcess({ ...crt() });
            return createScene();
        });

        const levels: number = banded.uniforms.levels;
        const curve: number = curved.uniforms.curve;
        const mask: number = tube.uniforms.mask;
        banded.uniforms.strength = levels / 8;

        // @ts-expect-error: dither has no knob by that name, and saying so is the point.
        void banded.uniforms.levles;
        // @ts-expect-error: a knob is a number, not a word.
        banded.uniforms.levels = 'four';

        expect(levels).toBe(4);
        expect(curve).toBe(0.3);
        expect(mask).toBe(0);
        expect(banded.uniforms.strength).toBe(0.5);
    });
});
