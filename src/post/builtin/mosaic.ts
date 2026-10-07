import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Turns the picture into big square blocks, each the colour at its middle.
 *
 * The consoles of the era had this in hardware, set from one register, and it was how a game
 * dissolved into a room or out of a hit. `size` is in game pixels and is meant to be animated: from
 * `1`, which is nothing, up to whatever is coarse enough and back.
 *
 * @param options `size` is how many game pixels wide one block is.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * const blocks = usePostProcess(mosaic({ size: 1 }));
 * useUpdate((dt) => { blocks.uniforms.size = Math.min(16, blocks.uniforms.size + dt * 20); });
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mosaic = (options: { size?: number } = {}): TBuiltinPostEffect<{ size: number }> => ({
    name: 'mosaic',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let size = max(1.0, floor(mu.size));
    let middle = (floor(uv * mu.resolution / size) + 0.5) * size;
    return sampleTexture(min(middle, mu.resolution - 0.5) / mu.resolution);
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    float size = max(1.0, floor(mu.size));
    vec2 middle = (floor(uv * mu.resolution / size) + 0.5) * size;
    return sampleTexture(min(middle, mu.resolution - 0.5) / mu.resolution);
}
`,
    uniforms: { size: options.size ?? 4 },
    uniformSig: { size: 'f32' },
});
