import { composerViewDir, composerWorldNormal } from './inputs';
import {
    composerClamp, composerDiv, composerDot, composerFloor, composerMul, composerNormalize, composerPow, composerSub,
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
    composerPow(composerSub(1, composerClamp(composerDot(composerNormalize(composerWorldNormal()), composerViewDir()), 0, 1)), power);

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
