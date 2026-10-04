import { lerp } from '../math/lerp';
import type { TColor } from './color';

/**
 * Linearly interpolates two colors channel by channel (straight RGBA, not gamma
 * corrected): `t = 0` returns `a`, `t = 1` returns `b`. The built-in for color fades
 * and tinted hit-flashes: feed it the eased value from a tween's `onUpdate`. GLSL
 * calls this `mix`.
 * @param a - The colour at `0`.
 * @param b - The colour at `1`.
 * @param t - How far from `a` to `b`.
 * @returns A new colour.
 *
 * @category Color & palettes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lerpColor = (a: TColor, b: TColor, t: number): TColor => ({
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
    a: lerp(a.a, b.a, t),
});
