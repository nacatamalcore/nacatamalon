import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * A tube's phosphor, which kept glowing a moment after the beam had gone: bright things moving fast
 * leave a short trail.
 *
 * It reads what it showed last frame and keeps whichever is brighter, the new picture or the old
 * one dimmed by `persistence`. That costs two pictures the size of the canvas while it runs. Put it
 * before `crt`, so the trail is of the picture and not of the lines and the mask.
 *
 * @param options `persistence` from `0` (none) to just under `1` (a long trail).
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(phosphor({ persistence: 0.5 }));
 * usePostProcess(crt());
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const phosphor = (options: { persistence?: number } = {}): TBuiltinPostEffect<{ persistence: number }> => ({
    name: 'phosphor',
    history: true,
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let before = sampleHistory(uv).rgb * clamp(mu.persistence, 0.0, 0.98);
    return vec4<f32>(max(color.rgb, before), color.a);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec3 before = sampleHistory(uv).rgb * clamp(mu.persistence, 0.0, 0.98);
    return vec4(max(color.rgb, before), color.a);
}
`,
    uniforms: { persistence: options.persistence ?? 0.6 },
    uniformSig: { persistence: 'f32' },
});
