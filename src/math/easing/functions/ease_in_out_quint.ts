/**
 * Quintic ease-in-out.
 *
 * @param t - How far along, from `0` at the start to `1` at the end.
 * @returns The eased value, `0` at the start and `1` at the end.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const easeInOutQuint = (t: number): number =>
    (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2);
