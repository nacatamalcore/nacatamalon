import type { TBox } from '../box/types/t_box';
import type { TDrawable } from '../gameobjects/types';
import type { TTransform2d } from '../gameobjects/types/t_transform_2d';
import type { TMask } from './types/t_mask';

/**
 * One masked object, as the frame found it: its mask, the masks around it, which camera it is seen
 * through and where it is. What a drawable under it is kept to is this and its `parent`s.
 *
 * Kept per object between frames and written over, so a masked scene allocates nothing once it has
 * been drawn once.
 *
 * @internal
 */
export type TMaskLevel = {
    mask: TMask;
    parent: TMaskLevel | null;
    /** The camera the masked object is seen through, as an index into the pass's, `-1` for none. */
    camera: number;
    /** Where the masked object is in its world, which is what its `rect` is measured from. */
    place: TTransform2d;
};

/**
 * What a shape is made of this frame: everything its object and the ones under it draw, with the
 * camera each is seen through.
 *
 * @internal
 */
export type TShapeList = { drawables: TDrawable[]; cameraIndex: number[] };

/**
 * What the walk of the tree notes for masks, beside the drawables it collects: the innermost mask
 * of each, one entry per drawable, and each mask's shape.
 *
 * @internal
 */
export type TMaskWalk = {
    levels: Array<TMaskLevel | null>;
    shapes: Map<TMask, TShapeList>;
};

const levelOfBox = new WeakMap<TBox, TMaskLevel>();

/**
 * The level for a masked object this frame, written into the one it had last frame.
 *
 * @internal
 */
export const maskLevelFor = (box: TBox, mask: TMask, parent: TMaskLevel | null, camera: number, place: TTransform2d): TMaskLevel => {
    let level = levelOfBox.get(box);
    if (level === undefined) {
        level = { mask, parent, camera, place: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } };
        levelOfBox.set(box, level);
    }
    level.mask = mask;
    level.parent = parent;
    level.camera = camera;
    // Copied, because what the walk hands over is written over by the next object at this depth.
    level.place.x = place.x;
    level.place.y = place.y;
    level.place.rotation = place.rotation;
    level.place.scaleX = place.scaleX;
    level.place.scaleY = place.scaleY;
    return level;
};

/**
 * Whether a mask keeps anything to anything right now: on, and with a rectangle or a shape.
 *
 * @internal
 */
export const masksNow = (mask: TMask | null): mask is TMask => mask !== null && mask.enabled && (mask.by !== null || mask.rect !== null);

/**
 * Whether a drawable can be part of a shape: what lies flat and has an outline. A model, particles
 * or lines cannot.
 *
 * @internal
 */
export const canShape = (drawable: TDrawable): boolean =>
    drawable.type === 'sprite' || drawable.type === 'text' || drawable.type === 'nine-slice' || drawable.type === 'polygon' || drawable.type === 'tilemap';

/**
 * Notes a drawable as part of the shape of every mask in `roles`, seen through `camera`.
 *
 * @internal
 */
export const noteShape = (walk: TMaskWalk, roles: readonly TMask[], drawable: TDrawable, camera: number): void => {
    if (!canShape(drawable)) {
        return;
    }
    for (const mask of roles) {
        let list = walk.shapes.get(mask);
        if (list === undefined) {
            list = { drawables: [], cameraIndex: [] };
            walk.shapes.set(mask, list);
        }
        list.drawables.push(drawable);
        list.cameraIndex.push(camera);
    }
};
