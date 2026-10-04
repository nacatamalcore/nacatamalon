import { composeTransform2d } from '../render/shared/compose_transform_2d';
import { placementOf } from './placement_of';
import type { TBox } from './types/t_box';
import type { TTransform2d } from '../gameobjects/types/t_transform_2d';

const identity = (): TTransform2d => ({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

/**
 * Everything above an object, composed: the frame its own placement is measured in.
 *
 * **Only each ancestor's own placement, never what any of them draws.** This is the asymmetry that
 * matters and the one that is easy to get wrong: what an object draws says where *it* is, and says
 * nothing about where the things under it are. A scene root with a label in the corner is still a
 * scene root at nothing in particular, and reading that label's corner as the room's placement
 * would move every object in the room by it.
 */
const parentFrame = (box: TBox): TTransform2d => {
    const chain: TBox[] = [];
    for (let at = box.parent; at !== null; at = at.parent) {
        chain.push(at);
    }

    // From the top down, because a placement only means anything once its own frame is known.
    const frame = identity();
    for (let i = chain.length - 1; i >= 0; i--) {
        const place = chain[i].transform;
        if (place !== null) {
            composeTransform2d({ ...frame }, place, frame);
        }
    }
    return frame;
};

/**
 * Where an object ends up in the world once everything above it has moved, turned and grown it.
 *
 * A simulation works in one space, while an object's placement is relative to whatever it hangs
 * under. Without this, a body under a grouping object simulates perfectly **in the wrong place**,
 * and grouping is exactly how a level is organised: every platform under one `Level` object.
 *
 * The same composition the frame does for the renderer, in the form something outside the renderer
 * can ask for, and answering for the object's real placement, which in this engine is as often its
 * picture's as its own.
 * @param box - The object.
 * @returns Where it ends up in the world.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const worldPlacementOf = (box: TBox): TTransform2d => {
    const frame = parentFrame(box);
    const own = placementOf(box);
    return own === null ? frame : composeTransform2d({ ...frame }, own, frame);
};

/**
 * The placement an object must hold for it to end up **at** a world point: the other half, and the
 * one that makes a world answer writable.
 *
 * A solver says where a body ended up in the world; that has to be stored on an object whose
 * placement is relative to whatever it hangs under, and this is that conversion.
 * @param box - The object.
 * @param world - Where it should end up in the world.
 * @returns The position to write in its own placement.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const localPositionFrom = (box: TBox, world: { x: number; y: number }): { x: number; y: number } => {
    const frame = parentFrame(box);
    const dx = world.x - frame.x;
    const dy = world.y - frame.y;
    const cos = Math.cos(-frame.rotation);
    const sin = Math.sin(-frame.rotation);
    // Turned back and then unscaled, which is the composition above read backwards, in that order.
    return {
        x: (dx * cos - dy * sin) / (frame.scaleX === 0 ? 1 : frame.scaleX),
        y: (dx * sin + dy * cos) / (frame.scaleY === 0 ? 1 : frame.scaleY),
    };
};
