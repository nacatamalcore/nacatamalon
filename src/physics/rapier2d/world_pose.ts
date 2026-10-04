import { localPositionFrom, placementOf, worldPlacementOf } from '../../box';
import type { TGameObject } from '../../hooks/spawn/use_spawn';

/**
 * Where an object's body really is in the world, and how to write a simulated pose back onto it.
 *
 * Rapier simulates in one space while an object's placement is relative to whatever it hangs
 * under, so a body under a group built from its local numbers simulates correctly **at the wrong
 * place**. That is especially easy to hit in two dimensions, because grouping is how a level is
 * organised: every platform under one `Level` object.
 *
 * The engine answers both halves already (`worldPlacementOf` going out, `localPositionFrom` coming
 * back), and both of them read the placement an object actually has, which in this engine is as
 * often its picture's as its own.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */

export type TPose2d = { x: number; y: number; angle: number; scaleX: number; scaleY: number };

/**
 * An object's placement in the world, in the flat terms Rapier is told about.
 */
export const worldPose2d = (box: TGameObject): TPose2d => {
    const place = worldPlacementOf(box);
    return {
        x: place.x,
        y: place.y,
        angle: place.rotation,
        scaleX: place.scaleX,
        scaleY: place.scaleY,
    };
};

/**
 * Stores a simulated pose on the object, converting through whatever it hangs under. For an object
 * at the scene's root, which is the shape of most flat scenes, every conversion here is nothing.
 *
 * It writes onto the placement the object really has: its own if it was placed, and otherwise the
 * one its picture carries, which is where `createSprite({ transform })` put it.
 */
export const writeWorldPose2d = (box: TGameObject, x: number, y: number, angle: number): void => {
    const place = placementOf(box);
    if (place === null) {
        return;
    }
    const local = localPositionFrom(box, { x, y });
    place.x = local.x;
    place.y = local.y;
    // The parent's own turn is taken off rather than composed away: in two dimensions both are
    // plain angles about the same axis, and a subtraction cannot introduce a third one.
    const parent = box.parent === null ? 0 : worldPlacementOf(box.parent).rotation;
    place.rotation = angle - parent;
};
