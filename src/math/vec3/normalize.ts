import type { TVec3 } from './index';
import { len } from './len';
import { scale } from './scale';

/**
 * Returns a unit vector in the same direction. Returns `(0, 0, 0)` if the input is a zero vector.
 *
 * @param a The vector.
 * @returns A new vector of length 1, or zero.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const normalize = (a: TVec3): TVec3 => {
    const l = len(a);
    return l > 0 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 };
};
