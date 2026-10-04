import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Looks every colour up in a grading table and mixes towards what it says.
 *
 * **This is grading, not limiting.** A table moves colours about (warmer, colder, more contrast, a
 * green night); a palette or a dither take colours away. They compose, and in one order only:
 * **grade first, limit last.** The other way round grades colours the machine could not show and
 * then picks a neighbour for them, which throws away the whole point of the grade.
 *
 * @param options `amount` is how far to go, from the frame untouched at `0` to the table's word at `1`.
 * @returns The effect, for `usePostProcess`. It needs a table, from `useLoadLut`.
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lutGrade = (options: { amount?: number } = {}): TBuiltinPostEffect<{ amount: number }> => ({
    name: 'lut',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let graded = lutColor(clamp(color.rgb, vec3<f32>(0.0), vec3<f32>(1.0)));
    return vec4<f32>(mix(color.rgb, graded, mu.amount), color.a);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec3 graded = lutColor(clamp(color.rgb, 0.0, 1.0));
    return vec4(mix(color.rgb, graded, mu.amount), color.a);
}
`,
    uniforms: { amount: options.amount ?? 1 },
    uniformSig: { amount: 'f32' },
});
