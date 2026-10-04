import type { TVec3 } from './index';

/**
 * Returns the dot product. Result is 0 if vectors are perpendicular, positive if same direction, negative if opposite.
 *
 * @param a The first vector.
 * @param b The second vector.
 * @returns The dot product.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const dot = (a: TVec3, b: TVec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
