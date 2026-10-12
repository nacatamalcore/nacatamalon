import * as easing from '../math/easing/functions';
import type { TEaseFn } from '../math/easing';

/**
 * Every easing curve of the engine by its name, which is what a `.motion` file writes: a file can
 * only say a word, and the word is the name the curve is exported under.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MOTION_EASES = easing satisfies Record<string, TEaseFn>;

/**
 * Whether a word is the name of a curve.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isMotionEase = (name: unknown): name is keyof typeof MOTION_EASES =>
    typeof name === 'string' && Object.hasOwn(MOTION_EASES, name);
