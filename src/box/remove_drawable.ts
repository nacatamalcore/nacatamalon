import type { TDrawable } from '../gameobjects/types';
import type { TBox } from './types/t_box';

/**
 * Takes one drawable out of the box holding it, keeping the rest in the order they were added:
 * that order is what the renderer draws back to front.
 *
 * Does nothing when it is not there, so the caller does not have to find out first.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const removeDrawable = (box: TBox, drawable: TDrawable): void => {
    const index = box.drawables.indexOf(drawable);
    if (index === -1) {
        return;
    }
    box.drawables.splice(index, 1);
};
