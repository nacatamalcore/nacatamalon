import { RAD2DEG } from './constants';

/**
 * Converts `rad` (radians) to degrees: handy for showing an engine angle in a debug
 * overlay or editor field, where degrees read more naturally than radians.
 *
 * @param rad The angle in radians.
 * @returns The same angle in degrees.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const radToDeg = (rad: number): number => rad * RAD2DEG;
