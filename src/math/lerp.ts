/**
 * Linear interpolation between numbers `a` and `b`: `t = 0` returns `a`, `t = 1`
 * returns `b`. Not clamped. The scalar building block under fades, manual tweens, and
 * `lerpColor` / `vec2Lerp`. GLSL calls this `mix`.
 *
 * @param a Where it starts.
 * @param b Where it ends.
 * @param t How far along, 0 to 1.
 * @returns The number in between.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
