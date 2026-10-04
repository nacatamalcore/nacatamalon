import { localPosition3dFrom, localQuaternionFrom, placement3dOf, worldPlacement3dOf } from '../../box';
import type { TQuat } from '../../math/quat';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TPose3d } from '../../box';

/**
 * Where an object's body really is, and how to write a simulated pose back onto it.
 *
 * The simulation is **global**: box3d knows one world and a body's place is a place in it. An
 * object's placement is **local**, relative to whatever it hangs under. For an object at the root of
 * a scene those are the same numbers, which is why reading the placement straight worked for as long
 * as every physics scene was one level deep. Under a grouping object it is wrong in the way that is
 * hardest to find: the body simulates correctly, at the wrong place, and the shape is drawn
 * somewhere else again.
 *
 * Both directions go through the engine, which is the point: one definition of "where is this
 * really", not two that drift. And both of them read the placement the object **actually** has,
 * which in this engine is as often its shape's as its own.
 *
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */

export type TVec3 = { x: number; y: number; z: number };

/**
 * The pose the solver has to be told at creation, in the world's terms.
 */
export const worldPoseOf = (box: TGameObject): TPose3d => worldPlacement3dOf(box);

/**
 * Stores a simulated pose on the object, converting through whatever it hangs under.
 *
 * The turn is written as a whole and not as three angles, because the solver's answer is a free turn
 * in space and three angles cannot hold one without losing something. What is new against the other
 * engine is only that the value stored is the **local** one.
 */
export const writeWorldPose = (box: TGameObject, position: TVec3, rotation: TQuat): void => {
    const place = placement3dOf(box);
    if (place === null) {
        return;
    }
    const local = localPosition3dFrom(box, position);
    place.x = local.x;
    place.y = local.y;
    place.z = local.z;
    place.quaternion = localQuaternionFrom(box, rotation);
};

/**
 * Stores a place and leaves the facing alone: the character's case, where the capsule is moved by
 * asking the world what is in the way and is never turned by the solver.
 */
export const writeWorldPosition = (box: TGameObject, position: TVec3): void => {
    const place = placement3dOf(box);
    if (place === null) {
        return;
    }
    const local = localPosition3dFrom(box, position);
    place.x = local.x;
    place.y = local.y;
    place.z = local.z;
};
