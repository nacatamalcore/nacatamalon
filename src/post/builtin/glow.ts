import type { TColorOption } from '../../color/get_color';
import { colorUniform } from './color_uniform';
import { gaussPass } from './gauss';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * A soft light of one colour around everything an object draws, behind it: a coin that shines, a
 * selected card, a ghost. Made for a filter (`useFilter`); on the whole screen there is nothing
 * see-through for it to shine into. For what is bright on the screen to glow, `bloom()`.
 *
 * The object's shape is blurred at half its size and laid behind it in the colour, so the light is
 * wide and cheap.
 *
 * @param options `color` of the light; `radius` about how far it reaches, in game pixels;
 * `intensity` how strong it is, `1` as bright as the object is solid and more for a harder glow.
 * @returns The effect, for `useFilter`.
 *
 * @example
 * ```ts
 * declare const coin: TGameObject;
 *
 * const shine = useFilter({ effects: [glow({ color: '#ffd23f', radius: 6 })] });
 * shine.add(coin);
 * ```
 *
 * @category Filters
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const glow = (options: { color?: TColorOption | [number, number, number]; radius?: number; intensity?: number } = {}): TBuiltinPostEffect<{
    color: number[]; radius: number; intensity: number;
}> => ({
    name: 'glow',
    passes: [gaussPass('x', 0.5), gaussPass('y', 0.5)],
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let sharp = sampleInput(uv);
    let light = clamp(sampleTextureSmooth(uv).a * mu.intensity, 0.0, 1.0) * (1.0 - sharp.a);
    return vec4<f32>(sharp.rgb + mu.color * light, sharp.a + light);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec4 sharp = sampleInput(uv);
    float light = clamp(sampleTextureSmooth(uv).a * mu.intensity, 0.0, 1.0) * (1.0 - sharp.a);
    return vec4(sharp.rgb + mu.color * light, sharp.a + light);
}
`,
    uniforms: { color: colorUniform(options.color, [1, 0.9, 0.5]), radius: options.radius ?? 6, intensity: options.intensity ?? 1.5 },
    uniformSig: { color: 'vec3<f32>', radius: 'f32', intensity: 'f32' },
    reach: (uniforms) => Math.max(0, uniforms.radius),
});
