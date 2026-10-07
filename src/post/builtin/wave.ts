import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Slides each line of the picture sideways by a moving wave: heat over sand, a room under water,
 * a dream.
 *
 * It moves **whole lines**, one game row at a time, which is how the consoles did it: by changing
 * the scroll of the next line while the screen was being drawn. A smooth version looks like a
 * modern shader; this one looks like the hardware. `axis: 1` moves columns up and down instead.
 *
 * @param options `amplitude` is how far a line moves, in game pixels; `frequency` how many waves fit
 * on the screen; `speed` how fast they travel; `axis` `0` for lines, `1` for columns.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(wave({ amplitude: 3, frequency: 6, speed: 4 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wave = (options: {
    amplitude?: number;
    frequency?: number;
    speed?: number;
    axis?: 0 | 1;
} = {}): TBuiltinPostEffect<{ amplitude: number; frequency: number; speed: number; axis: number }> => ({
    name: 'wave',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let line = (floor(uv * mu.resolution) + 0.5) / mu.resolution;
    let across = select(line.y, line.x, mu.axis > 0.5);
    let shift = sin(across * mu.frequency * 6.2831853 + mu.time * mu.speed) * mu.amplitude;
    var at = uv;
    if (mu.axis > 0.5) {
        at.y = at.y + shift / mu.resolution.y;
    } else {
        at.x = at.x + shift / mu.resolution.x;
    }
    return sampleTexture(clamp(at, vec2<f32>(0.0), vec2<f32>(1.0)));
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 line = (floor(uv * mu.resolution) + 0.5) / mu.resolution;
    float across = mu.axis > 0.5 ? line.x : line.y;
    float shift = sin(across * mu.frequency * 6.2831853 + mu.time * mu.speed) * mu.amplitude;
    vec2 at = uv;
    if (mu.axis > 0.5) {
        at.y += shift / mu.resolution.y;
    } else {
        at.x += shift / mu.resolution.x;
    }
    return sampleTexture(clamp(at, 0.0, 1.0));
}
`,
    uniforms: {
        amplitude: options.amplitude ?? 4,
        frequency: options.frequency ?? 4,
        speed: options.speed ?? 3,
        axis: options.axis ?? 0,
    },
    uniformSig: { amplitude: 'f32', frequency: 'f32', speed: 'f32', axis: 'f32' },
});
