import type { TBox } from '../box/types/t_box';
import type { TDrawable } from '../gameobjects/types';
import type { TTransform2d } from '../gameobjects/types/t_transform_2d';
import type { TMask } from './types/t_mask';
import type { TFilter } from '../filter/types/t_filter';

/**
 * One masked or filtered object, as the frame found it: its mask or its filter, the ones around it,
 * which camera it is seen through and where it is. What a drawable under it is kept to, and run
 * through, is this and its `parent`s.
 *
 * One per masked or filtered object and walk, made fresh for each walk: a few per frame, for the
 * objects that have one. Each level is one of the two: an object with both has two levels, its
 * filter's inside its mask's, so what the filter draws around it is kept to the mask too.
 *
 * @internal
 */
export type TMaskLevel = {
    /** The mask, or `null` on a filter's level. */
    mask: TMask | null;
    /** The filter, or `null` on a mask's level. */
    filter: TFilter | null;
    /** The object it is on: what a filter's `rect` is measured in, and whose layer it is. */
    box: TBox | null;
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
    /**
     * Each masked object's level in this walk. Per walk and not per object: a capture or a preview
     * walks the same tree again in the same frame, through cameras of its own, and must not move
     * the screen's masks while doing so.
     */
    found: Map<TBox, TMaskLevel>;
    /** Each filtered object's level in this walk, apart from its mask's, which `found` holds. */
    filtered: Map<TBox, TMaskLevel>;
};

/**
 * The level for a masked object in this walk: one per object, however many times the walk asks.
 *
 * @internal
 */
export const maskLevelFor = (walk: TMaskWalk, box: TBox, mask: TMask, parent: TMaskLevel | null, camera: number, place: TTransform2d): TMaskLevel =>
    levelFor(walk.found, box, mask, null, parent, camera, place);

/**
 * The level for a filtered object in this walk, inside its mask's when it has one: one per object,
 * however many times the walk asks.
 *
 * @internal
 */
export const filterLevelFor = (walk: TMaskWalk, box: TBox, filter: TFilter, parent: TMaskLevel | null, camera: number, place: TTransform2d): TMaskLevel =>
    levelFor(walk.filtered, box, null, filter, parent, camera, place);

const levelFor = (
    found: Map<TBox, TMaskLevel>,
    box: TBox,
    mask: TMask | null,
    filter: TFilter | null,
    parent: TMaskLevel | null,
    camera: number,
    place: TTransform2d,
): TMaskLevel => {
    let level = found.get(box);
    if (level === undefined) {
        level = { mask, filter, box, parent, camera, place: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } };
        found.set(box, level);
    }
    level.mask = mask;
    level.filter = filter;
    level.box = box;
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
