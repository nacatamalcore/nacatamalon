import type { TVec2 } from './index';

/**
 * Every component multiplied by `s`: the same direction, `s` times as long.
 *
 * @param a The vector.
 * @param s The factor.
 * @returns A new vector.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const scale = (a: TVec2, s: number): TVec2 => ({ x: a.x * s, y: a.y * s });
