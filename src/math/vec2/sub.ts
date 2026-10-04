import type { TVec2 } from './index';

/**
 * `a - b`, component by component. `sub(target, from)` is the arrow from `from` to `target`.
 *
 * @param a The vector subtracted from.
 * @param b The vector taken away.
 * @returns A new vector.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sub = (a: TVec2, b: TVec2): TVec2 => ({ x: a.x - b.x, y: a.y - b.y });
