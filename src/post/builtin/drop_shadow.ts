import type { TColorOption } from '../../color/get_color';
import type { TVec2 } from '../../math/vec2';
import { colorUniform } from './color_uniform';
import { gaussPass } from './gauss';
import { pointUniform } from './point_uniform';
import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * A shadow of everything an object draws, fallen a little way off behind it: a panel lifted off the
 * screen, a character over the ground. Made for a filter (`useFilter`); on the whole screen there is
 * nothing see-through for it to fall on.
 *
 * @param options `offset` how far it falls, in game pixels, as `{ x, y }` (down and to the right are
 * positive); `radius` how soft its edge is, in game pixels, `0` for a hard one as pixel art has it;
 * `color` of the shadow; `amount` how dark, from `0`, none, to `1`.
 * @returns The effect, for `useFilter`.
 *
 * @example
 * ```ts
 * declare const panel: TGameObject;
 *
 * useFilter({ effects: [dropShadow({ offset: { x: 2, y: 3 }, radius: 0 })] }).add(panel);
 * ```
 *
 * @category Filters
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const dropShadow = (options: { offset?: TVec2; radius?: number; color?: TColorOption | [number, number, number]; amount?: number } = {}): TBuiltinPostEffect<{
    offset: number[]; radius: number; color: number[]; amount: number;
}> => ({
    name: 'dropShadow',
    passes: [gaussPass('x', 1), gaussPass('y', 1)],
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let sharp = sampleInput(uv);
    let fallen = sampleTextureSmooth(uv - mu.offset / mu.resolution).a;
    let shade = clamp(fallen * mu.amount, 0.0, 1.0) * (1.0 - sharp.a);
    return vec4<f32>(sharp.rgb + mu.color * shade, sharp.a + shade);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec4 sharp = sampleInput(uv);
    float fallen = sampleTextureSmooth(uv - mu.offset / mu.resolution).a;
    float shade = clamp(fallen * mu.amount, 0.0, 1.0) * (1.0 - sharp.a);
    return vec4(sharp.rgb + mu.color * shade, sharp.a + shade);
}
`,
    uniforms: {
        offset: pointUniform(options.offset, [2, 2]),
        radius: options.radius ?? 2,
        color: colorUniform(options.color, [0, 0, 0]),
        amount: options.amount ?? 0.6,
    },
    uniformSig: { offset: 'vec2<f32>', radius: 'f32', color: 'vec3<f32>', amount: 'f32' },
    reach: (uniforms) => Math.max(Math.abs(uniforms.offset[0] ?? 0), Math.abs(uniforms.offset[1] ?? 0)) + Math.max(0, uniforms.radius),
});
