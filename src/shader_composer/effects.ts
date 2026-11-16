import { composerSwizzle, composerVec2 } from './constructors';
import { composerUv, composerViewDir, composerWorldNormal } from './inputs';
import {
    composerAdd, composerAtan2, composerClamp, composerDiv, composerDot, composerFloor, composerLength, composerMul,
    composerNormalize, composerPow, composerSub,
} from './math';
import type { TComposerInput, TComposerNode } from './types/t_composer_node';

// Named recipes, made only of the pieces above: they compile to the same graph you could wire by
// hand, and add nothing the compiler has to know about.

/**
 * The rim term, from 0 where the surface faces the camera to 1 where it turns away (`f32`): the
 * start of a rim light, a hologram or a force field. A higher `power` pulls the rim in to the
 * silhouette.
 *
 * It reads which way the surface faces and where the camera is, so it only exists in a model's
 * colour stage, and the compiler says so anywhere else.
 * @param power - How tightly the rim hugs the silhouette. Default `3`.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerFresnel = (power: TComposerInput = 3): TComposerNode =>
    composerPow(composerSub(1, composerClamp(composerDot(composerNormalize(composerWorldNormal()), composerNormalize(composerViewDir())), 0, 1)), power);

/**
 * Cuts a gradient into `steps` flat bands, the cartoon look. Put the light through it for hard
 * lighting, or any other gradient. Same type in as out; more steps is smoother.
 * @param value - The gradient to cut.
 * @param steps - How many bands. Default `3`.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerCelShade = (value: TComposerNode, steps: TComposerInput = 3): TComposerNode =>
    composerDiv(composerFloor(composerMul(value, steps)), steps);

/**
 * A place read round a centre (`vec2`): `x` how far from it, `0` there and `1` at the middle of the
 * picture's edge (the circle that fits in it), and `y` how far round, a turn from `0` to `1`. Read a
 * picture at it and a strip becomes a ring: a dial, a radar, a target, rays from a sun, a ring that
 * fills like a clock (`composerStep(turn, fill)`), and with `composerTime()` added to either, one
 * that spins or flows outwards.
 *
 * Round as `composerAtan2` goes: `y` starts at `0` on the left (`-x`), is `0.5` on the right, and
 * grows towards `+y` of the place given, down a sprite's picture. To lay a strip of pictures round
 * it, swap the two (`composerSwizzle(polar, 'yx')`); to repeat it, multiply: `composerMul(polar,
 * composerVec2(1, 12))` is twelve times round. Where the turn starts again, on the left, a picture
 * meets itself: draw it so its two ends join.
 * @param coord - The place, `composerUv()` when left out.
 * @param center - The centre, in the same units. Default the middle of the picture, `(0.5, 0.5)`.
 * @returns The node, to use as the input of another.
 *
 * @example
 * ```ts
 * // A ring of numbers round a dial: the picture is the strip, laid once round.
 * const polar = composerPolar();
 * const strip = composerTextureSample(composerSwizzle(polar, 'yx'));
 * const material = createMaterial({ ...compileShader({ shader: 'sprite2d', color: strip }) });
 * ```
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerPolar = (coord: TComposerNode = composerUv(), center: TComposerInput = composerVec2(0.5, 0.5)): TComposerNode => {
    if (coord.type !== 'vec2<f32>') {
        throw new Error(`[NacatamalOn] shader composer: polar reads a place of two numbers (a vec2), got a ${coord.type}.`);
    }
    const offset = composerSub(coord, center);
    const distance = composerMul(composerLength(offset), 2);
    const turn = composerAdd(composerDiv(composerAtan2(composerSwizzle(offset, 'y'), composerSwizzle(offset, 'x')), Math.PI * 2), 0.5);
    return composerVec2(distance, turn);
};
