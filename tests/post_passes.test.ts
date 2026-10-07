import { describe, expect, it } from 'bun:test';
import { countPostSteps, passSize, postStepsOf } from '../src/render/shared/post_steps';
import { buildPostShader } from '../src/render/webgpu/post/post_shader';
import { buildPostShaderGlsl } from '../src/render/webgl2/post/post_shader';
import { newPostEffect } from '../src/post/new_post_effect';

/**
 * An effect that needs more than one read of the frame, and the promise that one which does not
 * is drawn exactly as before.
 */

const PASS_WGSL = 'fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return sampleTextureSmooth(uv); }';
const PASS_GLSL = 'vec4 effect(vec4 color, vec2 uv) { return sampleTextureSmooth(uv); }';
const HOOK_WGSL = 'fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return color + sampleInput(uv); }';
const HOOK_GLSL = 'vec4 effect(vec4 color, vec2 uv) { return color + sampleInput(uv); }';

describe('the steps of an effect', () => {
    it('is just the hook for an effect with no passes', () => {
        const effect = newPostEffect({ fragment: HOOK_WGSL, fragmentGlsl: HOOK_GLSL }, null, 'scene');

        expect(effect.passes).toBeUndefined();
        expect(postStepsOf(effect)).toEqual([{ fragment: HOOK_WGSL, fragmentGlsl: HOOK_GLSL, scale: null }]);
    });

    it('runs the passes first and the hook last, at full size', () => {
        const effect = newPostEffect({
            fragment: HOOK_WGSL,
            fragmentGlsl: HOOK_GLSL,
            passes: [
                { fragment: PASS_WGSL, fragmentGlsl: PASS_GLSL, scale: 0.5 },
                { fragment: PASS_WGSL, fragmentGlsl: PASS_GLSL },
            ],
        }, null, 'scene');

        expect(postStepsOf(effect).map((step) => step.scale)).toEqual([0.5, 1, null]);
        expect(postStepsOf(effect).at(-1)?.fragment).toBe(HOOK_WGSL);
    });

    it('keeps a pass between a sixteenth and the whole game', () => {
        const effect = newPostEffect({
            fragment: HOOK_WGSL,
            passes: [
                { fragment: PASS_WGSL, fragmentGlsl: null, scale: 0 },
                { fragment: PASS_WGSL, fragmentGlsl: null, scale: 4 },
            ],
        }, null, 'scene');

        expect(postStepsOf(effect).map((step) => step.scale)).toEqual([0.0625, 1, null]);
    });

    it('carries history only when asked', () => {
        expect(newPostEffect({ fragment: HOOK_WGSL }, null, 'scene').history).toBeUndefined();
        expect(newPostEffect({ fragment: HOOK_WGSL, history: true }, null, 'scene').history).toBe(true);
    });
});

describe('how many slots a chain needs', () => {
    it('counts one per step, and one more for an effect that keeps a history', () => {
        const plain = newPostEffect({ fragment: HOOK_WGSL }, null, 'scene');
        const twoPasses = newPostEffect({
            fragment: HOOK_WGSL,
            passes: [{ fragment: PASS_WGSL, fragmentGlsl: null }, { fragment: PASS_WGSL, fragmentGlsl: null }],
        }, null, 'scene');
        const remembering = newPostEffect({ fragment: HOOK_WGSL, history: true }, null, 'scene');

        expect(countPostSteps([plain])).toBe(1);
        expect(countPostSteps([plain, twoPasses, remembering])).toBe(1 + 3 + 2);
    });

    it('sizes a pass against the game, never below one pixel', () => {
        expect(passSize(0.5, 320, 224)).toEqual([160, 112]);
        expect(passSize(0.0625, 8, 8)).toEqual([1, 1]);
    });
});

describe('what every hook can call', () => {
    it('declares the new readers in both languages', () => {
        const wgsl = buildPostShader(HOOK_WGSL, {});
        const glsl = buildPostShaderGlsl(HOOK_GLSL, {}).fragment;

        for (const helper of ['sampleTexture', 'sampleTextureSmooth', 'sampleInput', 'sampleHistory']) {
            expect(wgsl).toContain(`fn ${helper}(`);
            expect(glsl).toContain(`vec4 ${helper}(`);
        }
    });
});
