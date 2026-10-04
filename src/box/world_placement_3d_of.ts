import { conjugate, fromEuler, identity as identityQuat, multiply, rotateVec3 } from '../math/quat';
import type { TQuat } from '../math/quat';
import { placement3dOf } from './placement_3d_of';
import type { TBox } from './types/t_box';
import type { TTransform3d } from '../gameobjects/types/t_transform_3d';

/**
 * Where something is, which way it is turned and how big it is, in space and all at once.
 *
 * Three separate answers rather than the matrix the renderer builds from the same numbers, because
 * this is the form a solver is told about: it wants a place, a turn and a size, and pulling those
 * back out of a matrix means taking it apart again, which with a size that differs per axis under a
 * turn does not come back exactly.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPose3d = {
    position: { x: number; y: number; z: number };
    quaternion: TQuat;
    scale: { x: number; y: number; z: number };
};

/**
 * The one definition of which way a placement faces.
 *
 * A turn can be written two ways: as a whole, or as three angles. When both are there the whole one
 * wins, which is what the renderer does (`rotationMatrix`), and the three angles are read in the
 * same order it reads them: left and right, then up and down, then in the plane. Two definitions of
 * "facing" that drift apart would show one thing and collide with another.
 */
const turnOf = (place: TTransform3d): TQuat =>
    place.quaternion === undefined || place.quaternion === null
        ? fromEuler(place.rotationX, place.rotationY, place.rotation)
        : place.quaternion;

/**
 * A placement on its own, before anything above it has been applied.
 */
const poseOf = (place: TTransform3d): TPose3d => ({
    position: { x: place.x, y: place.y, z: place.z },
    quaternion: turnOf(place),
    scale: { x: place.scaleX, y: place.scaleY, z: place.scaleZ },
});

const nowhere = (): TPose3d => ({
    position: { x: 0, y: 0, z: 0 },
    quaternion: identityQuat(),
    scale: { x: 1, y: 1, z: 1 },
});

/**
 * Puts one placement inside another: move, then turn, then grow, the same recipe the renderer
 * follows, said in the three parts instead of in a matrix.
 */
const compose = (frame: TPose3d, local: TPose3d): TPose3d => {
    const scaled = {
        x: local.position.x * frame.scale.x,
        y: local.position.y * frame.scale.y,
        z: local.position.z * frame.scale.z,
    };
    const turned = rotateVec3(frame.quaternion, scaled);
    return {
        position: {
            x: frame.position.x + turned.x,
            y: frame.position.y + turned.y,
            z: frame.position.z + turned.z,
        },
        quaternion: multiply(frame.quaternion, local.quaternion),
        scale: {
            x: frame.scale.x * local.scale.x,
            y: frame.scale.y * local.scale.y,
            z: frame.scale.z * local.scale.z,
        },
    };
};

/**
 * Everything above an object, composed: the frame its own placement is measured in.
 *
 * **Only each ancestor's own placement, never what any of them draws**, for the reason the flat
 * version of this gives at length: what an object draws says where *it* is and says nothing about
 * where the things under it are.
 */
const parentFrame = (box: TBox): TPose3d => {
    const chain: TBox[] = [];
    for (let at = box.parent; at !== null; at = at.parent) {
        chain.push(at);
    }

    // From the top down, because a placement only means anything once its own frame is known.
    let frame = nowhere();
    for (let i = chain.length - 1; i >= 0; i--) {
        const place = chain[i].transform;
        if (place !== null) {
            frame = compose(frame, poseOf(place));
        }
    }
    return frame;
};

/**
 * Where an object ends up in space once everything above it has moved, turned and grown it.
 *
 * A simulation works in one space, while an object's placement is relative to whatever it hangs
 * under. Without this, a body under a grouping object simulates perfectly **in the wrong place**,
 * and grouping is exactly how a level is organised: every crate under one `Room` object.
 *
 * The flat twin of this answers the same question for a world that only has a plane in it. This one
 * is what a body in space needs, and the two are kept apart rather than merged because almost every
 * scene in this engine is flat and pays nothing for the one it does not use.
 * @param box - The object.
 * @returns Where it ends up in space: position, turn and size.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const worldPlacement3dOf = (box: TBox): TPose3d => {
    const frame = parentFrame(box);
    const own = placement3dOf(box);
    return own === null ? frame : compose(frame, poseOf(own));
};

/**
 * The place an object must be written down at for it to end up **at** a point in space: the other
 * half, and the one that makes a world answer writable.
 *
 * A solver says where a body ended up in the world; that has to be stored on an object whose
 * placement is relative to whatever it hangs under, and this is that conversion, which is the
 * composition above read backwards: undo the move, undo the turn, undo the size, in that order.
 * @param box - The object.
 * @param world - Where it should end up in space.
 * @returns The position to write in its own placement.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const localPosition3dFrom = (box: TBox, world: { x: number; y: number; z: number }): { x: number; y: number; z: number } => {
    const frame = parentFrame(box);
    const moved = {
        x: world.x - frame.position.x,
        y: world.y - frame.position.y,
        z: world.z - frame.position.z,
    };
    const turned = rotateVec3(conjugate(frame.quaternion), moved);
    // A size of zero has no way back, so it is treated as no resizing rather than as infinity.
    return {
        x: turned.x / (frame.scale.x === 0 ? 1 : frame.scale.x),
        y: turned.y / (frame.scale.y === 0 ? 1 : frame.scale.y),
        z: turned.z / (frame.scale.z === 0 ? 1 : frame.scale.z),
    };
};

/**
 * The turn an object must be written down with for it to end up facing a given way in space.
 *
 * The companion of {@link localPosition3dFrom}, and needed for the same reason: a solver's answer is
 * a free turn in the world, and what gets stored is relative to whatever the object hangs under. For
 * an object at the root of a scene, which is the shape of most scenes, this gives back what it was
 * handed.
 * @param box - The object.
 * @param world - The way it should face in space.
 * @returns The turn to write in its own placement.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const localQuaternionFrom = (box: TBox, world: TQuat): TQuat =>
    multiply(conjugate(parentFrame(box).quaternion), world);
