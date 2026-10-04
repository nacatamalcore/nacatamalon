import { c1, c3 } from './constants';

/**
 * Back ease-in: anticipates by pulling back before moving (overshoots below 0).
 *
 * @param t - How far along, from `0` at the start to `1` at the end.
 * @returns The eased value, `0` at the start and `1` at the end. On the way it goes past them,
 *   below `0` or above `1`: that overshoot is the curve.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const easeInBack = (t: number): number => c3 * t * t * t - c1 * t * t;
