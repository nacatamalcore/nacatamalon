import type { TQuat } from '../../math/quat';
import type { TTransform2d } from './t_transform_2d';

/**
 * Where something is in three dimensions, how it is turned and how big it is drawn.
 *
 * **The 2D transform is exactly its flat half**, with the same names: `x`, `y`, `rotation` (the turn
 * in the plane, around Z) and `scaleX`/`scaleY` mean here what they mean there. That is what lets one
 * box hold a 2D game, a 3D one, or both, without a second kind of placement to learn.
 *
 * Rotations are in radians and applied Y, then X, then Z, and the whole is move, then turn, then
 * scale. Written out rather than filled in from defaults, for the reason {@link TTransform2d} gives.
 *
 * A `quaternion` is the other way to say which way something is turned, and when one is set it is
 * the one that counts. Three angles cannot express every turn on their way to it: at certain
 * facings two of the three end up turning around the same line and one of them stops doing
 * anything, which is why a ship that is free to point anywhere, or a turn being eased from one
 * facing to another, is stored this way instead.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTransform3d = TTransform2d & {
    /**
     * Towards the viewer.
     */
    z: number;
    /**
     * Looking up and down, in radians.
     */
    rotationX: number;
    /**
     * Turning left and right, in radians.
     */
    rotationY: number;
    scaleZ: number;
    /**
     * Which way it is turned, as a whole. Set, it decides the turn and the three angles above are
     * ignored; left out, the three angles decide it as they always did.
     *
     * **It only speaks for three dimensions.** Anything flat inside this one, a picture or a piece
     * of writing, is still turned by `rotation`, because there is no such thing as half of a turn
     * in space taken flat.
     */
    quaternion?: TQuat | null;
};
