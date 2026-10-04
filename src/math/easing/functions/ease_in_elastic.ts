import { c4 } from './constants';

/**
 * Elastic ease-in: springy oscillation building up from rest.
 *
 * @param t - How far along, from `0` at the start to `1` at the end.
 * @returns The eased value, `0` at the start and `1` at the end. On the way it goes past them,
 *   below `0` or above `1`: that overshoot is the curve.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const easeInElastic = (t: number): number =>
    t === 0 ? 0
    : t === 1 ? 1
    : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
