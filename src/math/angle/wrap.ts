import { TAU } from './constants';

/**
 * Wraps `rad` into the range [-π, π). Rotations accumulated frame by frame
 * (`transform.rotation += spin * dt`) drift far outside that range over time;
 * wrapping keeps angle comparisons and interpolation well-behaved: call it before
 * `lerpAngle`, or whenever you need a canonical heading.
 *
 * @param rad The angle in radians, however many turns it has added up.
 * @returns The same heading, between -π and π.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const wrap = (rad: number): number => {
    const r = (rad + Math.PI) % TAU;
    return (r < 0 ? r + TAU : r) - Math.PI;
};
