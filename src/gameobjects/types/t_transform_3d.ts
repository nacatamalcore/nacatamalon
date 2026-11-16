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
 * **Which way each turns**, with `y` up, `x` to the right and `z` towards the viewer, as a camera
 * that is not turned sees them, looking along `-z`:
 *
 * - `rotationY` turns to the left as seen from above: a quarter, `Math.PI / 2`, takes `+x` to `-z`,
 *   and what looked along `-z` then looks along `-x`.
 * - `rotationX` looks up: a quarter takes what looked along `-z` to `+y`, and `+y` to `+z`.
 * - `rotation` turns about `z`, against the clock as the viewer sees it: a quarter takes `+x` to
 *   `+y`. The same number turns a sprite with the clock, because in 2D `y` grows down.
 *
 * Y first, so `rotationX` looks up and down from wherever `rotationY` has turned to, and `rotation`
 * rolls about the way it then faces.
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
     * Looking up and down, in radians: more looks up, what faced `-z` tipping towards `+y`.
     */
    rotationX: number;
    /**
     * Turning left and right, in radians: more turns to the left as seen from above, `+x` towards
     * `-z`.
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
    /**
     * The point it turns and grows about, in its own units from its origin, when that is not the
     * origin: a model's feet, `{ x: 0, y: -1, z: 0 }`, for one that stumbles forward over them; a
     * door's hinge. Left out, it turns about its origin as it always did.
     *
     * Setting it does not move anything: unturned and at its own size, every point of it is where
     * it was. Only a turn or a growth then goes about the pivot, the way a sprite's `pivot` does in
     * the plane, and what it holds turns and grows about it too.
     *
     * **It only speaks for three dimensions**, as `quaternion` does: a picture or a piece of writing
     * inside this one, and a light, still turn about the origin, by `rotation`.
     */
    pivot?: { x: number; y: number; z: number } | null;
};
