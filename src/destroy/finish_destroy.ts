import { forgetDrawableOwner, ownerOfDrawable, removeBox, removeDrawable, teardownBox } from '../box';
import type { TBox } from '../box';
import type { TDrawable } from '../gameobjects/types';
import type { TRuntimeStore } from '../store';
import { disposeDrawable } from './dispose_drawable';
import { isGameObject } from './is_game_object';

/**
 * Lets go of everything a box draws, itself and everything under it: the same per-kind disposal a
 * drawable destroyed on its own goes through.
 */
const disposeTree = (store: TRuntimeStore, box: TBox): void => {
    for (const drawable of box.drawables) {
        disposeDrawable(store, drawable);
        forgetDrawableOwner(drawable);
    }
    box.drawables.length = 0;

    for (const child of box.children) {
        disposeTree(store, child);
    }
};

/**
 * The last steps of a destruction, in the order they have to happen.
 *
 * A sprite: out of the box holding it, let go of what it owned, forget where it lived.
 *
 * A spawned object: off its parent **first**, so nothing walking the tree can still reach it,
 * then its cleanups (children first, each one guarded), then everything it and its children draw.
 * Cleanups run before disposal because a cleanup is allowed to look at what it is losing.
 *
 * Both roads end here, the frame's sweep and the immediate one, so the only difference between
 * them stays being *when* it runs and never *what* it does.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const finishDestroy = (store: TRuntimeStore, target: TDrawable | TBox): void => {
    if (isGameObject(target)) {
        removeBox(target);
        teardownBox(target);
        disposeTree(store, target);
        return;
    }

    const owner = ownerOfDrawable(target);
    if (owner !== undefined) {
        removeDrawable(owner.box, target);
    }
    disposeDrawable(store, target);
    forgetDrawableOwner(target);
};
