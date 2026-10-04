/**
 * A point or a direction in 3D: `x`, `y`, `z`.
 *
 * Every `vec3*` function takes anything with those fields, so a 3D transform works as it is:
 * `vec3Distance(player.transform, coin.transform)` needs no vector built first. They never change
 * what they are given: a vector that comes back is always a new object.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TVec3 = { x: number; y: number; z: number };

export const create = (x: number, y: number, z: number): TVec3 => ({ x, y, z });

export * from './add';
export * from './sub';
export * from './scale';
export * from './negate';
export * from './lerp';
export * from './equals';
export * from './dot';
export * from './cross';
export * from './len';
export * from './normalize';
export * from './dist';
