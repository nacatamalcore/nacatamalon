/**
 * An easing function: maps normalized time `t` in `[0, 1]` to an eased progress value
 * (also normally `[0, 1]`, though `back`/`elastic` overshoot outside it). Drives how a
 * tween accelerates: pass one as the `ease` of a tween, or sample it directly.
 *
 * @category Easing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TEaseFn = (t: number) => number;
