import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Smears the whole picture along one direction, as if it moved during the exposure.
 *
 * @param options `velocity` is the length and direction of the smear in game pixels, as `[x, y]`;
 * `samples` how many reads make it up, at most 32.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * const blur = usePostProcess(motionBlur({ velocity: [0, 0] }));
 * // while dashing: blur.uniforms.velocity = [12, 0];
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const motionBlur = (options: { velocity?: [number, number]; samples?: number } = {}): TBuiltinPostEffect<{
    velocity: number[]; samples: number;
}> => ({
    name: 'motionBlur',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let count = clamp(round(mu.samples), 1.0, 32.0);
    let reach = mu.velocity / mu.resolution;
    var sum = vec3<f32>(0.0);
    for (var i = 0; i < 32; i = i + 1) {
        if (f32(i) >= count) { break; }
        let along = select(f32(i) / (count - 1.0) - 0.5, 0.0, count < 1.5);
        sum = sum + sampleTextureSmooth(clamp(uv + reach * along, vec2<f32>(0.0), vec2<f32>(1.0))).rgb;
    }
    return vec4<f32>(sum / count, color.a);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    float count = clamp(floor(mu.samples + 0.5), 1.0, 32.0);
    vec2 reach = mu.velocity / mu.resolution;
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 32; i++) {
        if (float(i) >= count) { break; }
        float along = count < 1.5 ? 0.0 : float(i) / (count - 1.0) - 0.5;
        sum += sampleTextureSmooth(clamp(uv + reach * along, 0.0, 1.0)).rgb;
    }
    return vec4(sum / count, color.a);
}
`,
    uniforms: { velocity: options.velocity ?? [8, 0], samples: options.samples ?? 12 },
    uniformSig: { velocity: 'vec2<f32>', samples: 'f32' },
});
