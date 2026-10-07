import type { TBuiltinPostEffect } from './types/t_builtin';

/**
 * Bulges, pinches or twists a round patch of the picture: a lens, a black hole, a whirlpool.
 *
 * Outside `radius` nothing moves, and the edge of the patch always meets the picture around it, so
 * the effect can be dropped anywhere without a seam.
 *
 * @param options `center` from `[0, 0]` (top left) to `[1, 1]`; `radius` in game pixels; `bulge`
 * from `-1` (pinch) to `1` (bulge); `twist` is how far the middle turns, in radians.
 * @returns The effect, for `usePostProcess`.
 *
 * @example
 * ```ts
 * usePostProcess(distort({ center: [0.5, 0.5], radius: 60, twist: 2 }));
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const distort = (options: {
    center?: [number, number];
    radius?: number;
    bulge?: number;
    twist?: number;
} = {}): TBuiltinPostEffect<{ center: number[]; radius: number; bulge: number; twist: number }> => ({
    name: 'distort',
    fragment: /* wgsl */ `
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let place = uv * mu.resolution;
    let middle = mu.center * mu.resolution;
    let away = place - middle;
    let dist = length(away);
    if (dist >= mu.radius || dist < 0.0001) {
        return color;
    }
    let part = dist / mu.radius;
    // Read from nearer the middle to bulge, further out to pinch. Both meet the picture at the edge.
    let reach = mu.radius * pow(part, max(0.1, 1.0 + mu.bulge));
    let turn = mu.twist * (1.0 - part) * (1.0 - part);
    let s = sin(turn);
    let c = cos(turn);
    let direction = away / dist;
    let turned = vec2<f32>(direction.x * c - direction.y * s, direction.x * s + direction.y * c);
    let at = (middle + turned * reach) / mu.resolution;
    return sampleTextureSmooth(clamp(at, vec2<f32>(0.0), vec2<f32>(1.0)));
}
`,
    fragmentGlsl: /* glsl */ `
vec4 effect(vec4 color, vec2 uv) {
    vec2 place = uv * mu.resolution;
    vec2 middle = mu.center * mu.resolution;
    vec2 away = place - middle;
    float dist = length(away);
    if (dist >= mu.radius || dist < 0.0001) {
        return color;
    }
    float part = dist / mu.radius;
    float reach = mu.radius * pow(part, max(0.1, 1.0 + mu.bulge));
    float turn = mu.twist * (1.0 - part) * (1.0 - part);
    float s = sin(turn);
    float c = cos(turn);
    vec2 direction = away / dist;
    vec2 turned = vec2(direction.x * c - direction.y * s, direction.x * s + direction.y * c);
    vec2 at = (middle + turned * reach) / mu.resolution;
    return sampleTextureSmooth(clamp(at, 0.0, 1.0));
}
`,
    uniforms: {
        center: options.center ?? [0.5, 0.5],
        radius: options.radius ?? 64,
        bulge: options.bulge ?? 0.5,
        twist: options.twist ?? 0,
    },
    uniformSig: { center: 'vec2<f32>', radius: 'f32', bulge: 'f32', twist: 'f32' },
});
