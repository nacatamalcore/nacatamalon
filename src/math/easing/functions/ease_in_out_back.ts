import { c2 } from './constants';

/**
 * Back ease-in-out: anticipate on the way out, overshoot on the way in.
 *
 * @param t - How far along, from `0` at the start to `1` at the end.
 * @returns The eased value, `0` at the start and `1` at the end. On the way it goes past them,
 *   below `0` or above `1`: that overshoot is the curve.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const easeInOutBack = (t: number): number =>
    t < 0.5
        ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
