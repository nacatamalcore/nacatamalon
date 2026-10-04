import type { TVec3 } from './index';

/**
 * `a + b`, component by component: a position moved by an offset.
 *
 * @param a The first vector.
 * @param b The vector added to it.
 * @returns A new vector.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const add = (a: TVec3, b: TVec3): TVec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
