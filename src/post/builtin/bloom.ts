import { gaussPass } from './gauss';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Makes bright parts of the picture glow into what is around them, the soft light of the last
 * consoles of the era.
 *
 * Only what is brighter than `threshold` glows. That part is taken at half the game's size, blurred
 * at a quarter, and added back over the sharp picture, so the glow is wide and cheap.
 *
 * @param options `threshold` from `0` (everything glows) to `1` (nothing does); `intensity` how
 * strong the glow is; `radius` about how far it reaches, in game pixels.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(bloom({ threshold: 0.7, intensity: 0.8 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bloom = (options: { threshold?: number; intensity?: number; radius?: number } = {}): TBuiltinPostEffect<{
    threshold: number; intensity: number; radius: number;
}> => ({
    name: 'bloom',
    passes: [
        {
            scale: 0.5,
            fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let rgb = sampleTextureSmooth(uv).rgb;
    let bright = max(rgb.r, max(rgb.g, rgb.b));
    let keep = smoothstep(mu.threshold, min(1.0, mu.threshold + 0.25), bright);
    return vec4<f32>(rgb * keep, 1.0);
}
`,
            fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec3 rgb = sampleTextureSmooth(uv).rgb;
    float bright = max(rgb.r, max(rgb.g, rgb.b));
    float keep = smoothstep(mu.threshold, min(1.0, mu.threshold + 0.25), bright);
    return vec4(rgb * keep, 1.0);
}
`,
        },
        gaussPass('x', 0.25),
        gaussPass('y', 0.25),
    ],
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let sharp = sampleInput(uv);
    let glow = sampleTextureSmooth(uv).rgb * mu.intensity;
    // Added the way light adds on a screen: it brightens without ever passing white.
    return vec4<f32>(1.0 - (1.0 - sharp.rgb) * (1.0 - clamp(glow, vec3<f32>(0.0), vec3<f32>(1.0))), sharp.a);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec4 sharp = sampleInput(uv);
    vec3 glow = sampleTextureSmooth(uv).rgb * mu.intensity;
    return vec4(1.0 - (1.0 - sharp.rgb) * (1.0 - clamp(glow, 0.0, 1.0)), sharp.a);
}
`,
    uniforms: { threshold: options.threshold ?? 0.6, intensity: options.intensity ?? 0.8, radius: options.radius ?? 6 },
    uniformSig: { threshold: 'f32', intensity: 'f32', radius: 'f32' },
});
