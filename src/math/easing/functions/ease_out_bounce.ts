import { d1, n1 } from './constants';

/**
 * Bounce ease-out: lands and bounces like a dropped ball.
 *
 * The other two bounce curves are written in terms of this one, so it is the only place
 * the four arcs are spelled out.
 *
 * @param t - How far along, from `0` at the start to `1` at the end.
 * @returns The eased value, `0` at the start and `1` at the end.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const easeOutBounce = (t: number): number => {
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
};
