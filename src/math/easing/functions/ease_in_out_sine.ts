/**
 * Sine ease-in-out: the softest symmetric curve.
 *
 * @param t - How far along, from `0` at the start to `1` at the end.
 * @returns The eased value, `0` at the start and `1` at the end.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;
