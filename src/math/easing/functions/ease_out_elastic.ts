import { c4 } from './constants';

/**
 * Elastic ease-out: overshoot then springy settle. Great for pops and bounces.
 *
 * @param t - How far along, from `0` at the start to `1` at the end.
 * @returns The eased value, `0` at the start and `1` at the end. On the way it goes past them,
 *   below `0` or above `1`: that overshoot is the curve.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const easeOutElastic = (t: number): number =>
    t === 0 ? 0
    : t === 1 ? 1
    : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
