import type { TRuntimeStore } from '../store';
import type { TBox } from './types/t_box';

/**
 * Which game each box belongs to.
 *
 * Kept beside the box and weakly, for the same reason as `drawable_owner`: a box stays plain
 * runtime data, and `destroy` runs from gameplay code, where the active-game pointer is long
 * gone. The tree cannot answer this on its own, because reaching the game means reaching the
 * list of scenes, which lives in the game.
 */
const games = new WeakMap<TBox, TRuntimeStore>();

/**
 * Remembers which game `box` was made in. Called wherever a box is born: a scene root by
 * `startScene`, everything else by `spawnBox`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const trackBoxGame = (box: TBox, store: TRuntimeStore): void => {
    games.set(box, store);
};

/**
 * The game `box` belongs to, or `undefined` for one that was never part of a running game.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gameOfBox = (box: TBox): TRuntimeStore | undefined => games.get(box);
