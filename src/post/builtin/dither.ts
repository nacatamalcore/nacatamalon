import { BAYER_GLSL, BAYER_WGSL } from './bayer';
import { COLOR_LEVELS } from './color_levels';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Cuts each channel down to a few steps, hiding the bands with an ordered pattern.
 *
 * This is what the machines of the era did, and doing it here rather than in the artwork means it
 * applies to everything at once: the sprites, the lighting, the gradients a shader made up.
 *
 * It works **in the frame's own colours**, with no trip through linear light and back. That is
 * deliberate: the hardware it imitates had no notion of linear light, and a physically tidy version
 * of this bands in the wrong places.
 *
 * @param options `levels` is steps per channel, `strength` how much of the pattern to mix in.
 *
 * @example
 * ```ts
 * usePostProcess({ ...dither({ levels: COLOR_LEVELS.genesis }) });
 * ```
 * @returns The effect, for `usePostProcess`.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const dither = (options: { levels?: number; strength?: number } = {}): TBuiltinPostEffect<{ levels: number; strength: number }> => ({
    name: 'dither',
    fragment: /* wgsl */ `${BAYER_WGSL}
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let levels = max(2.0, round(mu.levels));
    let top = levels - 1.0;
    // One step, which is exactly the amplitude the pattern is allowed to have.
    let stepSize = 1.0 / top;
    // Half a byte up first: the frame is stored in 8 bits, and a colour on a step (1/7 is 36.43 of
    // 255) can be kept just under it (36), where the pattern's lowest dot would drop it a step.
    // So a colour from the palette comes out flat, as the hardware drew it.
    let nudged = color.rgb + 0.5 / 255.0 + bayer(uv * mu.resolution) * stepSize * mu.strength;
    // floor(x + 0.5) and not round(): WGSL rounds a half to the even step, and the pattern lands
    // exactly on halves (white nudged down half a step is 6.5 of 7), so WebGPU would drop a level
    // where WebGL2 does not.
    let stepped = floor(clamp(nudged, vec3<f32>(0.0), vec3<f32>(1.0)) * top + 0.5) / top;
    return vec4<f32>(stepped, color.a);
}
`,
    fragmentGlsl: /* glsl */ `${BAYER_GLSL}
vec4 effect(vec4 color, vec2 uv) {
    float levels = max(2.0, floor(mu.levels + 0.5));
    float top = levels - 1.0;
    float stepSize = 1.0 / top;
    // Half a byte up first, as in WGSL: a colour on a step stored just under it stays on it.
    vec3 nudged = color.rgb + 0.5 / 255.0 + bayer(uv * mu.resolution) * stepSize * mu.strength;
    vec3 stepped = floor(clamp(nudged, 0.0, 1.0) * top + 0.5) / top;
    return vec4(stepped, color.a);
}
`,
    uniforms: { levels: options.levels ?? COLOR_LEVELS.genesis, strength: options.strength ?? 1 },
    uniformSig: { levels: 'f32', strength: 'f32' },
});
