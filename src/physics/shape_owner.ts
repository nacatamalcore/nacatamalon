import type { TBox } from '../box';

/**
 * The object whose body a collision shape on `box` belongs to: the nearest one up the tree, `box`
 * itself first, carrying a body of the same dimension, or `null` when there is none.
 *
 * Its own object first, so a shape beside a body on one object is one more shape of that body: a
 * chair whose seat is said on the chair and whose back is said on an object under it is one chair.
 *
 * @internal
 */
export const shapeOwnerOf = (box: TBox, dimension: '2d' | '3d'): TBox | null => {
    const kind = dimension === '2d' ? 'physics-body-2d' : 'physics-body-3d';
    for (let at: TBox | null = box; at !== null; at = at.parent) {
        if (at.physics?._type === kind) return at;
    }
    return null;
};
