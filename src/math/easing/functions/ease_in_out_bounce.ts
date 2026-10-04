import { easeOutBounce } from './ease_out_bounce';

/**
 * Bounce ease-in-out.
 *
 * @param t - How far along, from `0` at the start to `1` at the end.
 * @returns The eased value, `0` at the start and `1` at the end.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const easeInOutBounce = (t: number): number =>
    t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2;
