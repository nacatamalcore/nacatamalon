/**
 * Quadratic ease-out: fast start, decelerating to a stop.
 *
 * @param t - How far along, from `0` at the start to `1` at the end.
 * @returns The eased value, `0` at the start and `1` at the end.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);
