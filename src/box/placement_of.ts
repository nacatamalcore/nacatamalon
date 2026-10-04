import type { TBox } from './types/t_box';
import type { TTransform2d } from '../gameobjects/types/t_transform_2d';

/**
 * Where an object really is: its own placement, and failing that the placement of the first thing
 * it draws.
 *
 * **Both are ordinary in this engine**, which is why this exists. `useTransform` places the object
 * itself, and `createSprite({ transform })` places what it draws inside it, and almost every scene
 * written by hand does the second. Anything that has to point at "where this object is" as one
 * answer, so that it can follow it or write back to it, has to ask here or it will read the origin
 * from half the scenes in the engine.
 *
 * It is not the answer to a different question: **what a document writes down**. There the two are
 * kept apart on purpose, because moving a drawable's offset onto its object would carry every child
 * of that object along with it.
 *
 * `null` when the object is not anywhere in particular and draws nothing, which is a grouping box.
 * @param box - The object.
 * @returns Its placement, or `null` when neither it nor anything it draws has one.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const placementOf = (box: TBox): TTransform2d | null => {
    if (box.transform !== null) {
        return box.transform;
    }
    const drawable = box.drawables[0];
    return drawable === undefined ? null : drawable.transform;
};
