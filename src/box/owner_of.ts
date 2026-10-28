import { ownerOfDrawable } from './drawable_owner';
import type { TDrawable } from '../gameobjects/types';
import type { TGameObject } from '../hooks/spawn/use_spawn';

/**
 * The object a sprite, a text or a mesh belongs to: the thing `useSpawn` made that drew it, or the
 * scene for one made straight in the scene's body. `null` once it or its piece has been destroyed,
 * or for one that was never placed.
 *
 * The way back from what was touched to the whole piece: `destroy(sprite)` takes only that sprite
 * away and leaves its piece running, with its other sprites and its `useUpdate`; `destroy(ownerOf(
 * sprite))` takes the piece. And `ownerOf(sprite).api` is what the piece offers.
 *
 * @param drawable Something drawn.
 * @returns The object it belongs to, or `null`.
 *
 * @example
 * ```ts
 * usePointer().onDown(({ target }) => {
 *     const piece = target === null ? null : ownerOf(target);
 *     if (piece !== null && piece !== sceneOf(piece)) destroy(piece);
 * });
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ownerOf = (drawable: TDrawable): TGameObject | null => {
    const box = ownerOfDrawable(drawable)?.box;
    // Its piece on its way out counts as gone too, in the gap before the frame sweeps it.
    return drawable.destroyed || box === undefined || box.destroyed ? null : box as TGameObject;
};
