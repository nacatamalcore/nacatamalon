import type { TBox } from '../box/types/t_box';
import { gameOfBox } from '../box/box_game';
import { getActiveGame } from '../store/active_game';
import type { TRuntimeStore } from '../store/types/t_runtime_store';

/**
 * The boxes each game has marked to be drawn over its screen effects (`useOverlay`), alive and still
 * marked.
 */
const marked = new WeakMap<TRuntimeStore, Set<TBox>>();

/** The boxes already told to leave the set when they go. */
const watched = new WeakSet<TBox>();

/**
 * Notes that `box` is marked to be drawn over the screen effects, or no longer is. A game with none
 * never looks for one: it draws its effects as it always did, and pays nothing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const countOverlay = (box: TBox, on: boolean): void => {
    const game = gameOfBox(box) ?? getActiveGame();
    if (game === null) {
        return;
    }
    let boxes = marked.get(game);
    if (boxes === undefined) {
        boxes = new Set();
        marked.set(game, boxes);
    }
    if (!on) {
        boxes.delete(box);
        return;
    }
    boxes.add(box);
    if (!watched.has(box)) {
        watched.add(box);
        const set = boxes;
        box.cleanups.push(() => {
            set.delete(box);
            watched.delete(box);
        });
    }
};

/**
 * Whether `game` has something marked to be drawn over its screen effects.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mayHaveOverlays = (game: TRuntimeStore): boolean => (marked.get(game)?.size ?? 0) > 0;
