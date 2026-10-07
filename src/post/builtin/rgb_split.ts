import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Reads the red, green and blue of each pixel from three slightly different places.
 *
 * Each offset is in game pixels, so a split of one pixel stays one pixel wide however large the
 * canvas is. Small and still, it is a cheap lens; large and shaken, it is a hit.
 *
 * @param options `red`, `green` and `blue` are where each channel is read from, as `[x, y]`.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(rgbSplit({ red: [-2, 0], blue: [2, 0] }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rgbSplit = (options: {
    red?: [number, number];
    green?: [number, number];
    blue?: [number, number];
} = {}): TBuiltinPostEffect<{ red: number[]; green: number[]; blue: number[] }> => ({
    name: 'rgbSplit',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let pixel = 1.0 / mu.resolution;
    let r = sampleTexture(clamp(uv + mu.red * pixel, vec2<f32>(0.0), vec2<f32>(1.0))).r;
    let g = sampleTexture(clamp(uv + mu.green * pixel, vec2<f32>(0.0), vec2<f32>(1.0))).g;
    let b = sampleTexture(clamp(uv + mu.blue * pixel, vec2<f32>(0.0), vec2<f32>(1.0))).b;
    return vec4<f32>(r, g, b, color.a);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 pixel = 1.0 / mu.resolution;
    float r = sampleTexture(clamp(uv + mu.red * pixel, 0.0, 1.0)).r;
    float g = sampleTexture(clamp(uv + mu.green * pixel, 0.0, 1.0)).g;
    float b = sampleTexture(clamp(uv + mu.blue * pixel, 0.0, 1.0)).b;
    return vec4(r, g, b, color.a);
}
`,
    uniforms: { red: options.red ?? [-1, 0], green: options.green ?? [0, 0], blue: options.blue ?? [1, 0] },
    uniformSig: { red: 'vec2<f32>', green: 'vec2<f32>', blue: 'vec2<f32>' },
});
