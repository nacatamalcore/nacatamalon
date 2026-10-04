import type { TVec2 } from './index';

/**
 * Returns the squared length. Prefer over `len` when only comparing distances: avoids the sqrt.
 * @since 1.0.0
 */
export const lenSq = (a: TVec2): number => a.x * a.x + a.y * a.y;

/**
 * How long the vector is: the speed of a velocity, the reach of an offset.
 *
 * @param a The vector.
 * @returns Its length.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const len = (a: TVec2): number => Math.sqrt(lenSq(a));
