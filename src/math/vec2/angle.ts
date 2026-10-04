import type { TVec2 } from './index';

/**
 * The angle a direction points at, in radians: 0 is right and it turns towards +y, which is
 * down on screen. It is what a sprite's `transform.rotation` wants, so
 * `ship.transform.rotation = vec2Angle(velocity)` turns a ship to face where it is going.
 *
 * @param a The direction.
 * @returns Its angle in radians, between -π and π.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const angle = (a: TVec2): number => Math.atan2(a.y, a.x);
