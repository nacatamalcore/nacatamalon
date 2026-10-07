import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * A ring that pushes the picture outwards as it passes, from an explosion, a landing, a spell.
 *
 * It does not grow on its own: `radius` is where the ring is now, and the game moves it. That keeps
 * one effect good for any number of blasts, at any speed, with any easing.
 *
 * @param options `center` is where it starts, from `[0, 0]` (top left) to `[1, 1]`; `radius`,
 * `amplitude` and `wavelength` are in game pixels; `brightness` lights the crest a little.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * const blast = usePostProcess(shockwave({ center: [0.5, 0.5] }));
 * useUpdate((dt) => { blast.uniforms.radius += dt * 240; });
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const shockwave = (options: {
    center?: [number, number];
    radius?: number;
    amplitude?: number;
    wavelength?: number;
    brightness?: number;
} = {}): TBuiltinPostEffect<{
    center: number[]; radius: number; amplitude: number; wavelength: number; brightness: number;
}> => ({
    name: 'shockwave',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let place = uv * mu.resolution;
    let away = place - mu.center * mu.resolution;
    let dist = length(away);
    let halfWave = max(mu.wavelength * 0.5, 0.0001);
    let into = (dist - mu.radius) / halfWave;
    if (abs(into) >= 1.0 || dist < 0.0001) {
        return color;
    }
    let crest = 1.0 - abs(into);
    let push = sin(into * 3.14159265) * mu.amplitude * crest;
    let at = (place - away / dist * push) / mu.resolution;
    let moved = sampleTexture(clamp(at, vec2<f32>(0.0), vec2<f32>(1.0)));
    return vec4<f32>(moved.rgb * (1.0 + mu.brightness * crest * crest), moved.a);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 place = uv * mu.resolution;
    vec2 away = place - mu.center * mu.resolution;
    float dist = length(away);
    float halfWave = max(mu.wavelength * 0.5, 0.0001);
    float into = (dist - mu.radius) / halfWave;
    if (abs(into) >= 1.0 || dist < 0.0001) {
        return color;
    }
    float crest = 1.0 - abs(into);
    float push = sin(into * 3.14159265) * mu.amplitude * crest;
    vec2 at = (place - away / dist * push) / mu.resolution;
    vec4 moved = sampleTexture(clamp(at, 0.0, 1.0));
    return vec4(moved.rgb * (1.0 + mu.brightness * crest * crest), moved.a);
}
`,
    uniforms: {
        center: options.center ?? [0.5, 0.5],
        radius: options.radius ?? 0,
        amplitude: options.amplitude ?? 6,
        wavelength: options.wavelength ?? 24,
        brightness: options.brightness ?? 0.15,
    },
    uniformSig: { center: 'vec2<f32>', radius: 'f32', amplitude: 'f32', wavelength: 'f32', brightness: 'f32' },
});
