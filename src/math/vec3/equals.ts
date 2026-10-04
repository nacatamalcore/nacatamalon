import type { TVec3 } from './index';

/**
 * Whether every component is exactly equal. Exact, so two results of arithmetic that should agree
 * can differ in the last decimal: compare a distance with a small number for those.
 *
 * @param a The first vector.
 * @param b The second vector.
 * @returns `true` when they match exactly.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const equals = (a: TVec3, b: TVec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;
