import type { TVec2 } from '../../math/vec2';

/**
 * A point an effect's option takes, `{ x, y }` like everywhere in the engine, as the `[x, y]` its
 * shader reads. A new array every time, so the caller's is never the uniform.
 */
export const pointUniform = (point: TVec2 | undefined, fallback: readonly [number, number]): number[] =>
    point === undefined ? [...fallback] : [point.x, point.y];
