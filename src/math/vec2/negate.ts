import type { TVec2 } from './index';

/**
 * The same vector pointing the opposite way.
 *
 * @param a The vector.
 * @returns A new vector.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const negate = (a: TVec2): TVec2 => ({ x: -a.x, y: -a.y });
