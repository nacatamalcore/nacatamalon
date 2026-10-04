/**
 * A point or a direction in 2D: `x`, `y`.
 *
 * Every `vec2*` function takes anything with those fields, so a transform works as it is:
 * `vec2Distance(player.transform, coin.transform)` needs no vector built first. They never change
 * what they are given: a vector that comes back is always a new object.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TVec2 = { x: number; y: number };

export const create = (x: number, y: number): TVec2 => ({ x, y });

export * from './add';
export * from './sub';
export * from './scale';
export * from './negate';
export * from './lerp';
export * from './equals';
export * from './dot';
export * from './len';
export * from './normalize';
export * from './dist';
export * from './angle';
