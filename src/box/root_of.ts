import type { TBox } from './types/t_box';

/**
 * The root of the tree `box` belongs to: the scene it was built in. A root is its own root.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rootOf = (box: TBox): TBox => {
    let current = box;
    while (current.parent !== null) {
        current = current.parent;
    }
    return current;
};
