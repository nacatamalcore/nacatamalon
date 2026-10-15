import { conjugate, rotateVec3 } from '../math/quat';
import { placementInside, worldPlacementOf } from './world_placement_of';
import { pose3dInside, worldPlacement3dOf } from './world_placement_3d_of';
import { ownerOfDrawable } from './drawable_owner';
import type { TBox } from './types/t_box';
import type { TPose3d } from './world_placement_3d_of';
import type { TTransform2d } from '../gameobjects/types/t_transform_2d';
import type { TSprite } from '../gameobjects/sprite/types/t_sprite';
import type { TText } from '../gameobjects/text/types/t_text';
import type { TNineSlice } from '../gameobjects/nine_slice/types/t_nine_slice';
import type { TMesh } from '../gameobjects/mesh/types/t_mesh';

type TPoint2d = { x: number; y: number };
type TPoint3d = { x: number; y: number; z: number };

const isObject = (target: object): target is TBox => 'children' in target;

/**
 * Where an object, or one picture it draws, is in the world. A picture sits inside its object, so
 * a sprite placed at 10 in an object at 100 is at 110.
 */
const placeOf = (target: TBox | TSprite | TText | TNineSlice): TTransform2d =>
    isObject(target) ? worldPlacementOf(target) : placementInside(ownerOfDrawable(target)?.box ?? null, target.transform);

const poseOf = (target: TBox | TMesh): TPose3d =>
    isObject(target) ? worldPlacement3dOf(target) : pose3dInside(ownerOfDrawable(target)?.box ?? null, target.transform);

/**
 * A size of zero has no way back, so it is treated as no resizing rather than as infinity.
 */
const undo = (value: number, scale: number): number => value / (scale === 0 ? 1 : scale);

/**
 * Where a point of the world falls on an object: measured from the object's own origin, along its
 * own turned and resized axes, which are the numbers its pictures are placed in.
 *
 * What a hit needs once it has landed: where on the membrane the bite was, to dent it there; which
 * end of a paddle the ball touched; where on an on-screen button the finger is. The object's
 * placement is taken whole, with everything it hangs under, and the camera is not part of it: the
 * `worldX`/`worldY` the pointer gives are the world this means.
 *
 * @param object The object to measure from, or a sprite, text or panel it draws.
 * @param point A point of the world.
 * @returns The same point, measured on the object.
 *
 * @example
 * ```ts
 * declare const paddle: TGameObject;
 * declare const ball: TSprite;
 * declare const PADDLE_WIDTH: number;
 *
 * // Where on the paddle the ball hit: -1 at its left end, 1 at its right one.
 * const at = worldToLocal(paddle, ball.transform);
 * const english = at.x / (PADDLE_WIDTH / 2);
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const worldToLocal = (object: TBox | TSprite | TText | TNineSlice, point: TPoint2d): TPoint2d => {
    const place = placeOf(object);
    const dx = point.x - place.x;
    const dy = point.y - place.y;
    const cos = Math.cos(-place.rotation);
    const sin = Math.sin(-place.rotation);
    // Turned back and then unscaled: the placement read backwards, in that order.
    return {
        x: undo(dx * cos - dy * sin, place.scaleX),
        y: undo(dx * sin + dy * cos, place.scaleY),
    };
};

/**
 * Where a point of an object is in the world: the way back from {@link worldToLocal}.
 *
 * For anything that leaves an object from a spot on it: the muzzle of a gun that turns, the hand
 * that throws, the place on a ship where the flame comes out. Written once in the object's own
 * numbers, it stays right however the object and everything above it move, turn and grow.
 *
 * @param object The object the point belongs to, or a sprite, text or panel it draws.
 * @param point A point measured on the object, from its own origin.
 * @returns The same point in the world.
 *
 * @example
 * ```ts
 * declare const turret: TGameObject;
 * declare const spawnShot: (x: number, y: number) => void;
 *
 * // A shot leaves from the end of the barrel, wherever the turret is facing.
 * const muzzle = localToWorld(turret, { x: 24, y: 0 });
 * spawnShot(muzzle.x, muzzle.y);
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const localToWorld = (object: TBox | TSprite | TText | TNineSlice, point: TPoint2d): TPoint2d => {
    const place = placeOf(object);
    const x = point.x * place.scaleX;
    const y = point.y * place.scaleY;
    const cos = Math.cos(place.rotation);
    const sin = Math.sin(place.rotation);
    return {
        x: place.x + x * cos - y * sin,
        y: place.y + x * sin + y * cos,
    };
};

/**
 * {@link worldToLocal} for a world with depth: where a point in space falls on a model, along its
 * own turned and resized axes.
 *
 * @param object The object to measure from, or a model it draws.
 * @param point A point in space.
 * @returns The same point, measured on the object.
 *
 * @example
 * ```ts
 * declare const cell: TGameObject;
 * declare const food: TMesh;
 * declare const dentAt: (x: number, y: number, z: number) => void;
 *
 * // Which side of the cell the food touched, to dent the membrane there.
 * const at = worldToLocal3d(cell, food.transform);
 * dentAt(at.x, at.y, at.z);
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const worldToLocal3d = (object: TBox | TMesh, point: TPoint3d): TPoint3d => {
    const pose = poseOf(object);
    const turned = rotateVec3(conjugate(pose.quaternion), {
        x: point.x - pose.position.x,
        y: point.y - pose.position.y,
        z: point.z - pose.position.z,
    });
    return {
        x: undo(turned.x, pose.scale.x),
        y: undo(turned.y, pose.scale.y),
        z: undo(turned.z, pose.scale.z),
    };
};

/**
 * {@link localToWorld} for a world with depth: where a point of a model is in space.
 *
 * @param object The object the point belongs to, or a model it draws.
 * @param point A point measured on the object, from its own origin.
 * @returns The same point in space.
 *
 * @example
 * ```ts
 * declare const sword: TMesh;
 *
 * // The tip of the sword, one unit along the blade, wherever the hand has swung it.
 * const tip = localToWorld3d(sword, { x: 0, y: 1, z: 0 });
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const localToWorld3d = (object: TBox | TMesh, point: TPoint3d): TPoint3d => {
    const pose = poseOf(object);
    const turned = rotateVec3(pose.quaternion, {
        x: point.x * pose.scale.x,
        y: point.y * pose.scale.y,
        z: point.z * pose.scale.z,
    });
    return {
        x: pose.position.x + turned.x,
        y: pose.position.y + turned.y,
        z: pose.position.z + turned.z,
    };
};
