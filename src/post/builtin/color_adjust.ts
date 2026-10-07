import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Brightness, contrast, saturation, gamma, a turn of the hue and a tint, in one pass.
 *
 * Every knob starts where it changes nothing, so it is safe to put in a chain and drive one number
 * at a time: `saturation: 0` is black and white, `tint: [1, 0.8, 0.6]` is an old photograph, a `hue`
 * of `180` swaps every colour for its opposite. They are applied in that order: gamma, contrast,
 * brightness, saturation, hue, tint.
 *
 * @param options `hue` is in degrees; the rest are multipliers, `1` being unchanged.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(colorAdjust({ saturation: 0.6, contrast: 1.1, tint: [1, 0.95, 0.85] }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const colorAdjust = (options: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    gamma?: number;
    hue?: number;
    tint?: [number, number, number];
} = {}): TBuiltinPostEffect<{
    brightness: number; contrast: number; saturation: number; gamma: number; hue: number; tint: number[];
}> => ({
    name: 'adjust',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    var rgb = pow(max(color.rgb, vec3<f32>(0.0)), vec3<f32>(1.0 / max(mu.gamma, 0.0001)));
    rgb = (rgb - 0.5) * mu.contrast + 0.5;
    rgb = rgb * mu.brightness;
    let grey = dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
    rgb = mix(vec3<f32>(grey), rgb, mu.saturation);
    // A turn about the grey axis, which moves every hue by the same angle and leaves grey alone.
    let angle = radians(mu.hue);
    let axis = vec3<f32>(0.57735027);
    let c = cos(angle);
    rgb = rgb * c + cross(axis, rgb) * sin(angle) + axis * dot(axis, rgb) * (1.0 - c);
    rgb = rgb * mu.tint;
    return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)), color.a);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec3 rgb = pow(max(color.rgb, vec3(0.0)), vec3(1.0 / max(mu.gamma, 0.0001)));
    rgb = (rgb - 0.5) * mu.contrast + 0.5;
    rgb *= mu.brightness;
    float grey = dot(rgb, vec3(0.299, 0.587, 0.114));
    rgb = mix(vec3(grey), rgb, mu.saturation);
    float angle = radians(mu.hue);
    vec3 axis = vec3(0.57735027);
    float c = cos(angle);
    rgb = rgb * c + cross(axis, rgb) * sin(angle) + axis * dot(axis, rgb) * (1.0 - c);
    rgb *= mu.tint;
    return vec4(clamp(rgb, 0.0, 1.0), color.a);
}
`,
    uniforms: {
        brightness: options.brightness ?? 1,
        contrast: options.contrast ?? 1,
        saturation: options.saturation ?? 1,
        gamma: options.gamma ?? 1,
        hue: options.hue ?? 0,
        tint: options.tint ?? [1, 1, 1],
    },
    uniformSig: {
        brightness: 'f32', contrast: 'f32', saturation: 'f32', gamma: 'f32', hue: 'f32', tint: 'vec3<f32>',
    },
});
