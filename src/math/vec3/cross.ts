import type { TVec3 } from './index';

/**
 * Returns a vector perpendicular to both `a` and `b`. The result magnitude equals the area of the parallelogram they form.
 *
 * @param a The first vector.
 * @param b The second vector.
 * @returns A new vector.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cross = (a: TVec3, b: TVec3): TVec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});
