/**
 * No easing: constant rate. `t` maps to itself.
 *
 * @param t - How far along, from `0` at the start to `1` at the end.
 * @returns `t` itself.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const linear: (t: number) => number = (t) => t;
