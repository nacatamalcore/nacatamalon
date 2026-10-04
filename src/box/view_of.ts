import type { TBox } from './types/t_box';

/**
 * The box whose view `box` belongs to: the nearest one above it, itself included, that is drawn
 * into a picture, and otherwise its scene.
 *
 * It is what a camera is kept on. Not `rootOf`, because a scene can hold a screen with its own
 * world, and a camera asked for inside that screen climbing to the scene would silently take over
 * the scene's view. Everything that is about the scene rather than the view (changing level,
 * counting what is loading) still goes to `rootOf`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const viewOf = (box: TBox): TBox => {
    let current = box;
    while (current.spriteTexture === null && current.parent !== null) {
        current = current.parent;
    }
    return current;
};
