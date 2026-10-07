import type { TPostPass } from '../types/t_post_effect';

/**
 * One direction of a soft blur, as a pass at `scale` of the game's size, for an effect with a
 * `radius` knob in game pixels.
 *
 * Five reads, but nine pixels' worth: each read lands between two pixels and the smooth sampler
 * averages them, at weights chosen so the pair sums to what two separate reads would. The scale is
 * written into the shader because a pass only knows its own size, and the radius is in the game's.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gaussPass = (axis: 'x' | 'y', scale: number): TPostPass & { fragmentGlsl: string } => {
    const factor = scale.toFixed(4);
    const dirWgsl = axis === 'x' ? 'vec2<f32>(1.0, 0.0)' : 'vec2<f32>(0.0, 1.0)';
    const dirGlsl = axis === 'x' ? 'vec2(1.0, 0.0)' : 'vec2(0.0, 1.0)';
    return {
        scale,
        fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let gap = ${dirWgsl} * (${factor} / mu.resolution) * max(mu.radius, 0.0) / 3.2307692;
    var sum = sampleTextureSmooth(uv).rgb * 0.2270270;
    sum = sum + (sampleTextureSmooth(uv + gap * 1.3846154).rgb + sampleTextureSmooth(uv - gap * 1.3846154).rgb) * 0.3162162;
    sum = sum + (sampleTextureSmooth(uv + gap * 3.2307692).rgb + sampleTextureSmooth(uv - gap * 3.2307692).rgb) * 0.0702703;
    return vec4<f32>(sum, 1.0);
}
`,
        fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 gap = ${dirGlsl} * (${factor} / mu.resolution) * max(mu.radius, 0.0) / 3.2307692;
    vec3 sum = sampleTextureSmooth(uv).rgb * 0.2270270;
    sum += (sampleTextureSmooth(uv + gap * 1.3846154).rgb + sampleTextureSmooth(uv - gap * 1.3846154).rgb) * 0.3162162;
    sum += (sampleTextureSmooth(uv + gap * 3.2307692).rgb + sampleTextureSmooth(uv - gap * 3.2307692).rgb) * 0.0702703;
    return vec4(sum, 1.0);
}
`,
    };
};
