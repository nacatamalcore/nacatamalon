import type { TBox } from './types/t_box';
import type { TTransform3d } from '../gameobjects/types/t_transform_3d';

/**
 * Where an object really is in three dimensions: its own placement, and failing that the placement
 * of the first thing it draws, **when that thing is a shape**.
 *
 * The flat twin of this ({@link placementOf}) takes the first drawable whatever it is, and that is
 * right there: everything flat carries `x`, `y` and a turn in the plane. Here it is not. A picture's
 * placement has no `z`, no pitch and no yaw, so reading one as an object's place in space would put
 * a body at depth zero facing forward and call it an answer. A shape's placement is a full one, so
 * only a shape is taken.
 *
 * `null` when the object is not anywhere in particular and draws no shape, which is a grouping box
 * or a flat object that has wandered into a question about space.
 * @param box - The object.
 * @returns Its placement in space, or `null` when it has none.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const placement3dOf = (box: TBox): TTransform3d | null => {
    if (box.transform !== null) {
        return box.transform;
    }
    const drawable = box.drawables[0];
    return drawable !== undefined && drawable.type === 'mesh' ? drawable.transform : null;
};
