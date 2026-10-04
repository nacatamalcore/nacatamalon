import type { TBox } from './types/t_box';

/**
 * Detaches a box from its parent, which is the one thing a scene never needs: a scene root is
 * held by the game's list of scenes, not by a parent.
 *
 * Does nothing to what is inside it. Running the cleanups is `teardownBox`'s job, and the two are
 * called together by the frame's sweep.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const removeBox = (box: TBox): void => {
    const parent = box.parent;
    if (parent === null) {
        return;
    }

    const index = parent.children.indexOf(box);
    if (index !== -1) {
        parent.children.splice(index, 1);
    }
    box.parent = null;
};
