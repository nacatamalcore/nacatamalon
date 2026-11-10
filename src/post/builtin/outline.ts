import type { TUniformColorValue } from '../../materials/types/t_uniforms';
import type { TColorOption } from '../../color/get_color';
import { colorUniform } from './color_uniform';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Draws a line of one colour around everything an object draws, outside it: one line around a
 * character made of pieces, not one per piece. Made for a filter (`useFilter`); on the whole screen
 * there is nothing see-through for it to draw around.
 *
 * Read pixel by pixel, so a contour of `1` around pixel art is one game pixel, hard, with no corner
 * left out. What is half see-through counts as much as it is there.
 *
 * @param options `color` of the line; `thickness` how many game pixels wide it is, up to 8.
 * @returns The effect, for `useFilter`.
 *
 * @example
 * ```ts
 * declare const hero: TGameObject;
 *
 * useFilter({ effects: [outline({ color: '#ffffff', thickness: 1 })] }).add(hero);
 * ```
 *
 * @category Filters
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const outline = (options: { color?: TColorOption | [number, number, number]; thickness?: number } = {}): TBuiltinPostEffect<{
    color: TUniformColorValue; thickness: number;
}> => ({
    name: 'outline',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    // Half up, as its twin and reach() round it: round() in WGSL sends a half to the even step.
    let reach = clamp(floor(mu.thickness + 0.5), 0.0, 8.0);
    let texel = 1.0 / mu.resolution;
    var near = 0.0;
    for (var y = -8; y <= 8; y = y + 1) {
        for (var x = -8; x <= 8; x = x + 1) {
            let at = vec2<f32>(f32(x), f32(y));
            if (abs(at.x) > reach || abs(at.y) > reach || dot(at, at) > reach * reach + reach) { continue; }
            near = max(near, sampleInput(uv + at * texel).a);
        }
    }
    let line = near * (1.0 - color.a);
    return vec4<f32>(color.rgb + mu.color * line, color.a + line);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    float reach = clamp(floor(mu.thickness + 0.5), 0.0, 8.0);
    vec2 texel = 1.0 / mu.resolution;
    float near = 0.0;
    for (int y = -8; y <= 8; y++) {
        for (int x = -8; x <= 8; x++) {
            vec2 at = vec2(float(x), float(y));
            if (abs(at.x) > reach || abs(at.y) > reach || dot(at, at) > reach * reach + reach) { continue; }
            near = max(near, sampleInput(uv + at * texel).a);
        }
    }
    float line = near * (1.0 - color.a);
    return vec4(color.rgb + mu.color * line, color.a + line);
}
`,
    uniforms: { color: colorUniform(options.color, [1, 1, 1]), thickness: options.thickness ?? 1 },
    uniformSig: { color: 'vec3<f32>', thickness: 'f32' },
    reach: (uniforms) => Math.min(8, Math.max(0, Math.round(uniforms.thickness))),
});
