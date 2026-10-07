import { gaussPass } from './gauss';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Keeps a band of the picture sharp and blurs above and below it, which makes a whole scene look
 * like a model on a table.
 *
 * @param options `focus` is where the sharp band sits, from `0` (top) to `1`; `band` how far it
 * reaches either side, and `feather` how long the fade into blur is, both as a share of the height;
 * `radius` how blurred the rest is, in game pixels.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(tiltShift({ focus: 0.6, band: 0.1 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const tiltShift = (options: { focus?: number; band?: number; feather?: number; radius?: number } = {}): TBuiltinPostEffect<{
    focus: number; band: number; feather: number; radius: number;
}> => ({
    name: 'tiltShift',
    passes: [gaussPass('x', 0.5), gaussPass('y', 0.5)],
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let away = abs(uv.y - mu.focus);
    let blurred = smoothstep(mu.band, mu.band + max(mu.feather, 0.0001), away);
    return mix(sampleInput(uv), sampleTextureSmooth(uv), blurred);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    float away = abs(uv.y - mu.focus);
    float blurred = smoothstep(mu.band, mu.band + max(mu.feather, 0.0001), away);
    return mix(sampleInput(uv), sampleTextureSmooth(uv), blurred);
}
`,
    uniforms: {
        focus: options.focus ?? 0.5,
        band: options.band ?? 0.12,
        feather: options.feather ?? 0.15,
        radius: options.radius ?? 5,
    },
    uniformSig: { focus: 'f32', band: 'f32', feather: 'f32', radius: 'f32' },
});
