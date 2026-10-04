import { DEG2RAD } from './constants';

/**
 * Converts `deg` (degrees) to radians: the unit every rotation in the engine uses
 * (sprite `transform.rotation`, a camera's `rotation`, a 3D object's `rotationX` and `rotationY`). Lets you author
 * angles the way you think about them: `transform.rotation = degToRad(45)`.
 *
 * @param deg The angle in degrees.
 * @returns The same angle in radians.
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const degToRad = (deg: number): number => deg * DEG2RAD;
