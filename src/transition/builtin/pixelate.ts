import { COVER_AMOUNT_GLSL, COVER_AMOUNT_WGSL } from './cover_amount';
import type { TColor } from '../../color';
import type { TTransition } from '../types/t_transition';

const BLACK: TColor = { r: 0, g: 0, b: 0, a: 1 };

/**
 * The picture falls apart into bigger and bigger blocks, then into flat colour, then back.
 *
 * The only one of the four that **reads the frame again** rather than painting over what it was
 * handed: it snaps the point it reads to a grid, so one block's worth of screen all comes back the
 * same colour.
 *
 * Two numbers here are not arbitrary and both were arrived at by looking at it:
 *
 * - The block **size** is what moves in a straight line, not the number of blocks. Size is one over
 *   count, so a straight line in size is a doubling of the count each step, which is what reads as
 *   the picture breaking down. Moving the count instead crawls for most of the transition and then
 *   jumps at the end.
 * - The colour comes in on `amount * amount`, so the blocks are seen for a good while before the
 *   colour swallows them. Bringing it in straight hides the effect under the paint.
 *
 * At rest it snaps to the centre of each pixel, which reads back exactly what was there: with
 * nothing to cover it changes nothing.
 *
 * @param duration How long the whole thing takes in milliseconds, breaking down and coming back.
 * @param color What it flattens into once the blocks are as big as they get.
 * @param minBlocks How many blocks across the short side of the screen at the worst of it. Six.
 * @returns The transition, for `useScene().change(name, { transition })`.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pixelate = (duration = 400, color: TColor = BLACK, minBlocks = 6): TTransition => ({
    name: 'pixelate',
    duration,
    uniforms: {
        color: [color.r, color.g, color.b, color.a],
        minBlocks,
    },
    uniformSig: { color: 'vec4<f32>', minBlocks: 'f32' },
    fragment: /* wgsl */ `${COVER_AMOUNT_WGSL}
fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    let amount = coverAmount();
    let shortest = max(1.0, min(mu.resolution.x, mu.resolution.y));
    let biggest = shortest / max(2.0, mu.minBlocks);
    let size = max(1.0, mix(1.0, biggest, amount));
    let grid = mu.resolution / size;
    let snapped = (floor(uv * grid) + vec2<f32>(0.5)) / grid;
    let sampled = sampleTexture(snapped);
    return vec4<f32>(mix(sampled.rgb, mu.color.rgb, amount * amount), color.a);
}
`,
    fragmentGlsl: /* glsl */ `${COVER_AMOUNT_GLSL}
vec4 effect(vec4 color, vec2 uv) {
    float amount = coverAmount();
    float shortest = max(1.0, min(mu.resolution.x, mu.resolution.y));
    float biggest = shortest / max(2.0, mu.minBlocks);
    float size = max(1.0, mix(1.0, biggest, amount));
    vec2 grid = mu.resolution / size;
    vec2 snapped = (floor(uv * grid) + vec2(0.5)) / grid;
    vec4 sampled = sampleTexture(snapped);
    return vec4(mix(sampled.rgb, mu.color.rgb, amount * amount), color.a);
}
`,
});
