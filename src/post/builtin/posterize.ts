import { COLOR_LEVELS } from './color_levels';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * The same cut as `dither`, with nothing to hide the seams.
 *
 * It exists as the other half of the pair rather than as a lesser version: hard bands are a look,
 * and it is the one that shows what the dithering is actually doing when you put the two side by
 * side.
 *
 * The same as `dither` with `amount: 0`: one or the other, not both (see `POST_BUILTINS`).
 *
 * @param options `levels` is steps per channel.
 * @returns The effect, for `usePostProcess`.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const posterize = (options: { levels?: number } = {}): TBuiltinPostEffect<{ levels: number }> => ({
    name: 'posterize',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let top = max(2.0, round(mu.levels)) - 1.0;
    // floor(x + 0.5), as in GLSL: WGSL's round() sends a half to the even step.
    return vec4<f32>(floor(clamp(color.rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * top + 0.5) / top, color.a);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    float top = max(2.0, floor(mu.levels + 0.5)) - 1.0;
    return vec4(floor(clamp(color.rgb, 0.0, 1.0) * top + 0.5) / top, color.a);
}
`,
    uniforms: { levels: options.levels ?? COLOR_LEVELS.poster },
    uniformSig: { levels: 'f32' },
});
