import { NOISE_GLSL, NOISE_WGSL } from './noise';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Tears the picture into horizontal bands and throws some of them sideways, with the colours coming
 * apart where they land: a signal failing, a save file corrupting, a boss arriving.
 *
 * The bands are chosen again `rate` times a second, so it jumps rather than slides, which is what
 * a broken signal does. `amount` is the share of bands that move; at `0` it is gone.
 *
 * @param options `slices` is how many bands; `offset` and `rgb` are in game pixels; `seed` gives a
 * different pattern of tears.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * const hit = usePostProcess(glitch({ amount: 0 }));
 * // on a hit: hit.uniforms.amount = 0.6, then ease it back to 0.
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const glitch = (options: {
    slices?: number;
    offset?: number;
    rgb?: number;
    amount?: number;
    rate?: number;
    seed?: number;
} = {}): TBuiltinPostEffect<{ slices: number; offset: number; rgb: number; amount: number; rate: number; seed: number }> => ({
    name: 'glitch',
    fragment: /* wgsl */ `${NOISE_WGSL}
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let tick = floor(mu.time * mu.rate) + mu.seed * 17.0;
    let band = floor(uv.y * max(1.0, mu.slices));
    var shift = 0.0;
    if (hash12(vec2<f32>(band, tick)) < mu.amount) {
        shift = (hash12(vec2<f32>(band, tick + 1.0)) - 0.5) * 2.0 * mu.offset;
    }
    let pixel = 1.0 / mu.resolution.x;
    let split = select(0.0, mu.rgb, shift != 0.0);
    let r = sampleTexture(vec2<f32>(clamp(uv.x + (shift + split) * pixel, 0.0, 1.0), uv.y)).r;
    let g = sampleTexture(vec2<f32>(clamp(uv.x + shift * pixel, 0.0, 1.0), uv.y)).g;
    let b = sampleTexture(vec2<f32>(clamp(uv.x + (shift - split) * pixel, 0.0, 1.0), uv.y)).b;
    return vec4<f32>(r, g, b, color.a);
}
`,
    fragmentGlsl: /* glsl */ `${NOISE_GLSL}
vec4 effect(vec4 color, vec2 uv) {
    float tick = floor(mu.time * mu.rate) + mu.seed * 17.0;
    float band = floor(uv.y * max(1.0, mu.slices));
    float shift = 0.0;
    if (hash12(vec2(band, tick)) < mu.amount) {
        shift = (hash12(vec2(band, tick + 1.0)) - 0.5) * 2.0 * mu.offset;
    }
    float pixel = 1.0 / mu.resolution.x;
    float split = shift != 0.0 ? mu.rgb : 0.0;
    float r = sampleTexture(vec2(clamp(uv.x + (shift + split) * pixel, 0.0, 1.0), uv.y)).r;
    float g = sampleTexture(vec2(clamp(uv.x + shift * pixel, 0.0, 1.0), uv.y)).g;
    float b = sampleTexture(vec2(clamp(uv.x + (shift - split) * pixel, 0.0, 1.0), uv.y)).b;
    return vec4(r, g, b, color.a);
}
`,
    uniforms: {
        slices: options.slices ?? 12,
        offset: options.offset ?? 16,
        rgb: options.rgb ?? 2,
        amount: options.amount ?? 0.3,
        rate: options.rate ?? 12,
        seed: options.seed ?? 0,
    },
    uniformSig: { slices: 'f32', offset: 'f32', rgb: 'f32', amount: 'f32', rate: 'f32', seed: 'f32' },
});
