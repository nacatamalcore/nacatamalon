import { c1, c3 } from './constants';

/**
 * Back ease-out: overshoots past the target then settles.
 *
 * @param t - How far along, from `0` at the start to `1` at the end.
 * @returns The eased value, `0` at the start and `1` at the end. On the way it goes past them,
 *   below `0` or above `1`: that overshoot is the curve.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const easeOutBack = (t: number): number =>
    1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
