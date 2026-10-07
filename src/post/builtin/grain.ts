import { NOISE_GLSL, NOISE_WGSL } from './noise';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Sprinkles the picture with grain, new every frame unless told to hold still.
 *
 * `size` is in game pixels, so the grain is as chunky as the art around it rather than finer than
 * anything else on screen.
 *
 * @param options `amount` is how strong; `size` how big a grain is; `animated` `0` to freeze it.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(grain({ amount: 0.06 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const grain = (options: { amount?: number; size?: number; animated?: 0 | 1 } = {}): TBuiltinPostEffect<{
    amount: number; size: number; animated: number;
}> => ({
    name: 'grain',
    fragment: /* wgsl */ `${NOISE_WGSL}
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let grainCell = floor(uv * mu.resolution / max(1.0, mu.size));
    let tick = select(0.0, floor(mu.time * 24.0), mu.animated > 0.5);
    let n = hash12(grainCell + tick * vec2<f32>(13.1, 7.7)) - 0.5;
    return vec4<f32>(clamp(color.rgb + n * mu.amount, vec3<f32>(0.0), vec3<f32>(1.0)), color.a);
}
`,
    fragmentGlsl: /* glsl */ `${NOISE_GLSL}
vec4 effect(vec4 color, vec2 uv) {
    vec2 grainCell = floor(uv * mu.resolution / max(1.0, mu.size));
    float tick = mu.animated > 0.5 ? floor(mu.time * 24.0) : 0.0;
    float n = hash12(grainCell + tick * vec2(13.1, 7.7)) - 0.5;
    return vec4(clamp(color.rgb + n * mu.amount, 0.0, 1.0), color.a);
}
`,
    uniforms: { amount: options.amount ?? 0.08, size: options.size ?? 1, animated: options.animated ?? 1 },
    uniformSig: { amount: 'f32', size: 'f32', animated: 'f32' },
});
