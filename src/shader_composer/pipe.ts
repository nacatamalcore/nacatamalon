import { asNode } from './constructors';
import type { TComposerInput, TComposerNode, TComposerStep } from './types/t_composer_node';

/**
 * Passes a value through a list of steps, left to right, so a long expression reads in the order
 * it happens instead of from the inside out.
 *
 * `composerPipe(x, composerMul(2), composerAdd(1), composerSin)` reads "take x, double it, add one,
 * then the sine", and is exactly `composerSin(composerAdd(composerMul(x, 2), 1))`. Any one-operand
 * function is a step as it is, and the two-operand ones that put the value on the left
 * (`composerAdd`, `composerMul`, `composerPow`...) become one when given a single operand. For
 * anything else, a small function `(n) => ...` is a step too.
 *
 * @example
 * ```ts
 * // 0.5 + 0.5 * sin(uv.y * lineCount + time * speed)
 * const bands = composerPipe(
 *     composerY(composerUv()),
 *     composerMul(composerUniform('lineCount', 120)),
 *     composerAdd(composerMul(composerTime(), composerUniform('speed', 6))),
 *     composerSin,
 *     composerMul(0.5),
 *     composerAdd(0.5),
 * );
 * ```
 * @param seed - The value to start with.
 * @param steps - What to do to it, in order.
 * @returns The node, to use as the input of another.
 *
 * @category Shader composer
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composerPipe = (seed: TComposerInput, ...steps: TComposerStep[]): TComposerNode =>
    steps.reduce<TComposerNode>((value, step) => step(value), asNode(seed));
