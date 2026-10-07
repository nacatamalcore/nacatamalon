import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Shafts of light streaming out from a point past whatever stands in front of it: sun through
 * trees, a window in a dark hall, a holy relic.
 *
 * The bright parts are taken at half the game's size, smeared outwards from `center` in a second
 * pass at the same size, and added back over the sharp picture. Only what is brighter than
 * `threshold` casts rays, so a dark silhouette in front of a bright sky is what makes them.
 *
 * @param options `center` from `[0, 0]` (top left) to `[1, 1]`, and it may lie off screen; `density`
 * how far the rays reach, from `0` to `1`; `decay` how fast they fade along the way; `intensity` how
 * strong they are.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(godrays({ center: [0.8, 0.1], threshold: 0.75 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const godrays = (options: {
    center?: [number, number];
    threshold?: number;
    density?: number;
    decay?: number;
    intensity?: number;
} = {}): TBuiltinPostEffect<{ center: number[]; threshold: number; density: number; decay: number; intensity: number }> => ({
    name: 'godrays',
    passes: [
        {
            scale: 0.5,
            fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let rgb = sampleTextureSmooth(uv).rgb;
    let bright = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    return vec4<f32>(rgb * smoothstep(mu.threshold, min(1.0, mu.threshold + 0.2), bright), 1.0);
}
`,
            fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec3 rgb = sampleTextureSmooth(uv).rgb;
    float bright = dot(rgb, vec3(0.299, 0.587, 0.114));
    return vec4(rgb * smoothstep(mu.threshold, min(1.0, mu.threshold + 0.2), bright), 1.0);
}
`,
        },
        {
            scale: 0.5,
            fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let stride = (uv - mu.center) * clamp(mu.density, 0.0, 1.0) / 32.0;
    var at = uv;
    var light = 1.0;
    var sum = vec3<f32>(0.0);
    for (var i = 0; i < 32; i = i + 1) {
        at = at - stride;
        sum = sum + sampleTextureSmooth(clamp(at, vec2<f32>(0.0), vec2<f32>(1.0))).rgb * light;
        light = light * mu.decay;
    }
    return vec4<f32>(sum / 32.0, 1.0);
}
`,
            fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 stride = (uv - mu.center) * clamp(mu.density, 0.0, 1.0) / 32.0;
    vec2 at = uv;
    float light = 1.0;
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 32; i++) {
        at -= stride;
        sum += sampleTextureSmooth(clamp(at, 0.0, 1.0)).rgb * light;
        light *= mu.decay;
    }
    return vec4(sum / 32.0, 1.0);
}
`,
        },
    ],
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let sharp = sampleInput(uv);
    let rays = clamp(sampleTextureSmooth(uv).rgb * mu.intensity * 2.0, vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(1.0 - (1.0 - sharp.rgb) * (1.0 - rays), sharp.a);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec4 sharp = sampleInput(uv);
    vec3 rays = clamp(sampleTextureSmooth(uv).rgb * mu.intensity * 2.0, 0.0, 1.0);
    return vec4(1.0 - (1.0 - sharp.rgb) * (1.0 - rays), sharp.a);
}
`,
    uniforms: {
        center: options.center ?? [0.5, 0.2],
        threshold: options.threshold ?? 0.7,
        density: options.density ?? 0.8,
        decay: options.decay ?? 0.96,
        intensity: options.intensity ?? 0.6,
    },
    uniformSig: { center: 'vec2<f32>', threshold: 'f32', density: 'f32', decay: 'f32', intensity: 'f32' },
});
