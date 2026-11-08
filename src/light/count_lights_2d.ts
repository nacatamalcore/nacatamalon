import type { TBox } from '../box/types/t_box';
import { gameOfBox } from '../box/box_game';
import { getActiveGame } from '../store/active_game';
import type { TRuntimeStore } from '../store/types/t_runtime_store';

/**
 * How many 2D lights each game has alive right now, and how many boxes left out of them.
 */
const counts = new WeakMap<TRuntimeStore, number>();
const unlitCounts = new WeakMap<TRuntimeStore, number>();

const count = (box: TBox, into: WeakMap<TRuntimeStore, number>): void => {
    const game = gameOfBox(box) ?? getActiveGame();
    if (game === null) return;
    into.set(game, (into.get(game) ?? 0) + 1);
    box.cleanups.push(() => into.set(game, Math.max(0, (into.get(game) ?? 1) - 1)));
};

/**
 * Counts a 2D light that `box` now holds, until the box goes. A game whose count is zero never
 * walks its scenes looking for 2D lights: a 2D game without them pays nothing for them.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const countLight2d = (box: TBox): void => count(box, counts);

/**
 * Counts a box left out of the 2D lights (`useUnlit2d`), until it goes. A lit scene only takes a view
 * of its own for such boxes when its game has one: a view is one of sixteen.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const countUnlit2d = (box: TBox): void => count(box, unlitCounts);

/**
 * Whether the game `box` belongs to may have a box left out of the 2D lights. Always for a box in
 * no running game.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mayHaveUnlit2d = (box: TBox): boolean => {
    const game = gameOfBox(box);
    return game === undefined || (unlitCounts.get(game) ?? 0) > 0;
};

/**
 * Whether the game `box` belongs to may have a 2D light anywhere. A box that is in no running game
 * (one a tool walks) is always looked through.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const mayHaveLights2d = (box: TBox): boolean => {
    const game = gameOfBox(box);
    return game === undefined || (counts.get(game) ?? 0) > 0;
};
