import { gaussPass } from './gauss';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Blurs the whole picture: a pause menu over the game, being out of focus, being underwater.
 *
 * It is worked out at half the game's size, across and then down, and blown back up smoothly, so
 * a wide blur costs about what a narrow one does.
 *
 * @param options `radius` is about how far a pixel spreads, in game pixels; `amount` mixes it with
 * the sharp picture, `1` being all blur.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * const out = usePostProcess(blur({ radius: 6, amount: 0 }));
 * // when the menu opens: out.uniforms.amount = 1;
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const blur = (options: { radius?: number; amount?: number } = {}): TBuiltinPostEffect<{ radius: number; amount: number }> => ({
    name: 'blur',
    passes: [gaussPass('x', 0.5), gaussPass('y', 0.5)],
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    return mix(sampleInput(uv), sampleTextureSmooth(uv), clamp(mu.amount, 0.0, 1.0));
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    return mix(sampleInput(uv), sampleTextureSmooth(uv), clamp(mu.amount, 0.0, 1.0));
}
`,
    uniforms: { radius: options.radius ?? 4, amount: options.amount ?? 1 },
    uniformSig: { radius: 'f32', amount: 'f32' },
});
