import { NOISE_GLSL, NOISE_WGSL } from './noise';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * An old film reel: sepia, grain, a scratch that comes and goes, a flicker and dark edges, all
 * stepping at twenty-four frames a second whatever the game runs at.
 *
 * @param options Each part from `0` (absent) to about `1`.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(oldFilm({ sepia: 0.8, scratches: 0.5 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const oldFilm = (options: {
    sepia?: number;
    noise?: number;
    scratches?: number;
    flicker?: number;
    vignette?: number;
} = {}): TBuiltinPostEffect<{ sepia: number; noise: number; scratches: number; flicker: number; vignette: number }> => ({
    name: 'oldFilm',
    fragment: /* wgsl */ `${NOISE_WGSL}
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let tick = floor(mu.time * 24.0);
    let grey = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
    var rgb = mix(color.rgb, vec3<f32>(grey) * vec3<f32>(1.07, 0.74, 0.43), mu.sepia);

    rgb = rgb + (hash12(floor(uv * mu.resolution) + tick * vec2<f32>(5.3, 9.1)) - 0.5) * mu.noise;

    if (hash12(vec2<f32>(tick, 2.0)) < mu.scratches) {
        let across = hash12(vec2<f32>(tick, 1.0));
        let wobble = (valueNoise(vec2<f32>(uv.y * 8.0, tick)) - 0.5) * 0.01;
        let off = abs(uv.x - across - wobble) * mu.resolution.x;
        rgb = rgb * mix(0.55, 1.0, smoothstep(0.0, 1.0, off));
    }

    rgb = rgb * (1.0 - mu.flicker * 0.2 * hash12(vec2<f32>(tick, 3.0)));
    let centred = uv * 2.0 - 1.0;
    rgb = rgb * (1.0 - mu.vignette * smoothstep(0.3, 1.6, dot(centred, centred)));
    return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)), color.a);
}
`,
    fragmentGlsl: /* glsl */ `${NOISE_GLSL}
vec4 effect(vec4 color, vec2 uv) {
    float tick = floor(mu.time * 24.0);
    float grey = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    vec3 rgb = mix(color.rgb, vec3(grey) * vec3(1.07, 0.74, 0.43), mu.sepia);

    rgb += (hash12(floor(uv * mu.resolution) + tick * vec2(5.3, 9.1)) - 0.5) * mu.noise;

    if (hash12(vec2(tick, 2.0)) < mu.scratches) {
        float across = hash12(vec2(tick, 1.0));
        float wobble = (valueNoise(vec2(uv.y * 8.0, tick)) - 0.5) * 0.01;
        float off = abs(uv.x - across - wobble) * mu.resolution.x;
        rgb *= mix(0.55, 1.0, smoothstep(0.0, 1.0, off));
    }

    rgb *= 1.0 - mu.flicker * 0.2 * hash12(vec2(tick, 3.0));
    vec2 centred = uv * 2.0 - 1.0;
    rgb *= 1.0 - mu.vignette * smoothstep(0.3, 1.6, dot(centred, centred));
    return vec4(clamp(rgb, 0.0, 1.0), color.a);
}
`,
    uniforms: {
        sepia: options.sepia ?? 0.7,
        noise: options.noise ?? 0.12,
        scratches: options.scratches ?? 0.4,
        flicker: options.flicker ?? 0.5,
        vignette: options.vignette ?? 0.4,
    },
    uniformSig: { sepia: 'f32', noise: 'f32', scratches: 'f32', flicker: 'f32', vignette: 'f32' },
});
