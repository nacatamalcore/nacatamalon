import { wrap } from './wrap';

/**
 * Interpolates from angle `a` toward `b` (both radians) along the **shortest** arc,
 * so going from 350° to 10° turns 20° forward instead of 340° back. Ideal for
 * smoothly steering a sprite toward a target heading. `t=0` returns `a`, `t=1`
 * returns an angle equivalent to `b`. Not clamped.
 *
 * @param a The angle it starts at, in radians.
 * @param b The angle it turns towards, in radians.
 * @param t How far along, 0 to 1.
 * @returns The angle in between.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lerpAngle = (a: number, b: number, t: number): number => a + wrap(b - a) * t;
