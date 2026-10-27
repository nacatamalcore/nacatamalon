import type { TRuntimeStore } from '../store/types/t_runtime_store';

/**
 * What each game has already said, by game. Weak, so a game that is gone takes what it said with it.
 */
const saidIn = new WeakMap<TRuntimeStore, Set<string>>();

/**
 * What was said where no game could be told, for the whole page.
 */
const saidOnPage = new Set<string>();

/**
 * Whether this is the first time `key` comes up in `game`, and from now on it is not: what a warning
 * that would repeat every frame asks before it says anything.
 *
 * Kept per game and not per page, so a second game started in the same page (a test with
 * `nacatamalon/headless` that makes several, a React page that mounts `<Game>` again) says it again
 * instead of keeping quiet because the first one did. Without a game to hand (`null` or `undefined`),
 * once for the whole page, as before.
 *
 * @param game The game it happened in.
 * @param key What was said, unique to the warning: `'listen: destroyed'`, or with the value it is
 *   about when each value is said once (`'physics layer: ' + name`).
 * @returns `true` the first time, `false` after.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const firstTimeIn = (game: TRuntimeStore | null | undefined, key: string): boolean => {
    let said = saidOnPage;
    if (game) {
        said = saidIn.get(game) ?? new Set();
        saidIn.set(game, said);
    }
    if (said.has(key)) return false;
    said.add(key);
    return true;
};

/**
 * Forgets what was said for the whole page under `key`, for the tests that call the engine with no
 * game and check that a warning is said: the first file to trip it would otherwise silence the rest.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const forgetOnPage = (key: string): void => {
    saidOnPage.delete(key);
};
