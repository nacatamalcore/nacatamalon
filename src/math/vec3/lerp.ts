import type { TVec3 } from './index';

/**
 * Linearly interpolates between `a` and `b`. `t=0` returns `a`, `t=1` returns `b`. Not clamped.
 *
 * @param a Where it starts.
 * @param b Where it ends.
 * @param t How far along, 0 to 1.
 * @returns A new vector.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lerp = (a: TVec3, b: TVec3, t: number): TVec3 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
});
