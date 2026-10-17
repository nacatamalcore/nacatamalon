import { composeTransform2d } from './compose_transform_2d';
import { ownerOfDrawable } from '../../box/drawable_owner';
import type { TDrawable } from '../../gameobjects/types';
import type { TTransform2d } from '../../gameobjects/types/t_transform_2d';

type TPoint = { x: number; y: number };

/**
 * A picture that can turn about a pivot: its own placement, and the pivot if it has one.
 */
type TPivoted = { readonly transform: TTransform2d; readonly pivot?: TPoint };

/** Its own placement and its box's together, written over picture by picture. */
const ownScratch: TTransform2d = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

/**
 * What turns a picture itself: its own placement inside the box it belongs to, and that box's own
 * placement. The box is the thing (a bike, a door) and the picture is how it looks, so turning the box
 * turns the picture about its pivot too. Boxes further up only carry it, as one, with everything else
 * in them.
 */
const ownPlacement = (picture: TPivoted): TTransform2d => {
    const box = ownerOfDrawable(picture as unknown as TDrawable)?.box;
    return box !== undefined && box.transform !== null ? composeTransform2d(box.transform, picture.transform, ownScratch) : picture.transform;
};

/**
 * Where a picture that turns about its `pivot` is drawn: the placement it is drawn by, holding it by
 * its pivot (the anchor it is drawn with is `pivot ?? anchor`).
 *
 * The anchor says where the picture sits when it is neither turned nor grown: its anchor point on its
 * placement. The pivot is the point it turns and grows about. So the pivot stays where it is when the
 * picture is laid out unturned, `(pivot − anchor) × size` away from the placement, and the picture is
 * turned and grown around it, by its own turn and growth and its box's (see `ownPlacement`). The boxes
 * above that move, turn and grow all of it as one, by the part of `world` that is not its own.
 *
 * With no pivot, or one on the anchor, this is the placement as it was: the same object, nothing
 * worked out, not even its box looked for.
 *
 * @param world - Where the picture's placement is in the world (`worldOf`).
 * @param picture - The picture: its own placement and its pivot.
 * @param anchor - Its anchor, or the default for its kind.
 * @param width - Its size before it is grown, in pixels.
 * @param height - Its size before it is grown, in pixels.
 * @param out - Written into when the pivot moves it, so a frame allocates nothing.
 * @returns `world`, or `out` moved to the pivot.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pivotPlace = (
    world: TTransform2d,
    picture: TPivoted,
    anchor: TPoint,
    width: number,
    height: number,
    out: TTransform2d,
): TTransform2d => {
    const pivot = picture.pivot;
    if (pivot === undefined || (pivot.x === anchor.x && pivot.y === anchor.y)) {
        return world;
    }
    const own = ownPlacement(picture);
    // How far the pivot is from the anchor, unturned and ungrown, then through what the boxes above
    // did: their turn and growth are what the world placement has beyond the picture's own.
    const dx = (pivot.x - anchor.x) * width * (own.scaleX !== 0 ? world.scaleX / own.scaleX : 1);
    const dy = (pivot.y - anchor.y) * height * (own.scaleY !== 0 ? world.scaleY / own.scaleY : 1);
    const turn = world.rotation - own.rotation;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    out.x = world.x + dx * cos - dy * sin;
    out.y = world.y + dx * sin + dy * cos;
    out.rotation = world.rotation;
    out.scaleX = world.scaleX;
    out.scaleY = world.scaleY;
    return out;
};
