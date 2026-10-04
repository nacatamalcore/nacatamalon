import type { TTransform2d } from '../../gameobjects/types/t_transform_2d';

/**
 * Puts a placement inside another one: where a child ends up once its parent has moved, turned and
 * grown. Written into `out`, which is the caller's to keep, so a frame composes without allocating.
 *
 * Only the flat half is read, so a parent turned in three dimensions still moves its 2D children in
 * the plane, and a parent whose turn is written as a quaternion turns them by its `rotation` alone.
 * It is TRS all the way down, which is what every 2D engine does and what keeps a placement
 * readable: non-uniform scale under rotation is not exactly an affine composition, and the price of
 * being exact would be carrying a matrix through things that only ever wanted x and y.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const composeTransform2d = (parent: TTransform2d, local: TTransform2d, out: TTransform2d): TTransform2d => {
    const cos = Math.cos(parent.rotation);
    const sin = Math.sin(parent.rotation);
    const x = local.x * parent.scaleX;
    const y = local.y * parent.scaleY;

    out.x = parent.x + x * cos - y * sin;
    out.y = parent.y + x * sin + y * cos;
    out.rotation = parent.rotation + local.rotation;
    out.scaleX = parent.scaleX * local.scaleX;
    out.scaleY = parent.scaleY * local.scaleY;
    return out;
};
