import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Smears the picture towards a point, as if the camera rushed at it: speed, a dash, an impact.
 *
 * @param options `center` from `[0, 0]` (top left) to `[1, 1]`; `strength` is how much of the way
 * to the centre the smear reaches; `samples` how many reads make it up, at most 32.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(zoomBlur({ strength: 0.15 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const zoomBlur = (options: { center?: [number, number]; strength?: number; samples?: number } = {}): TBuiltinPostEffect<{
    center: number[]; strength: number; samples: number;
}> => ({
    name: 'zoomBlur',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let count = clamp(round(mu.samples), 1.0, 32.0);
    var sum = vec3<f32>(0.0);
    for (var i = 0; i < 32; i = i + 1) {
        if (f32(i) >= count) { break; }
        let along = f32(i) / count * mu.strength;
        sum = sum + sampleTextureSmooth(mix(uv, mu.center, along)).rgb;
    }
    return vec4<f32>(sum / count, color.a);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    float count = clamp(floor(mu.samples + 0.5), 1.0, 32.0);
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 32; i++) {
        if (float(i) >= count) { break; }
        float along = float(i) / count * mu.strength;
        sum += sampleTextureSmooth(mix(uv, mu.center, along)).rgb;
    }
    return vec4(sum / count, color.a);
}
`,
    uniforms: { center: options.center ?? [0.5, 0.5], strength: options.strength ?? 0.1, samples: options.samples ?? 16 },
    uniformSig: { center: 'vec2<f32>', strength: 'f32', samples: 'f32' },
});
