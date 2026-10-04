import { getActiveGame } from '../../store';
import type { TRandomHandle } from '../../math/random';

/**
 * The random numbers of this game.
 *
 * Use it instead of `Math.random()` whenever a result should be repeatable: give `createGame` a
 * `seed` and every run of the game draws exactly the same numbers in the same order, which is what
 * makes a level layout, a replay or a bug report reproducible. Without a seed each run is different.
 *
 * `seed(n)` starts the sequence again from `n` at any moment.
 *
 * @returns The generator: `rand`, `randInt`, `chance`, `choose`, `shuffle` and `seed`.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const random = useRandom();
 *
 *     for (let i = 0; i < 20; i++) {
 *         createSprite({ key: 'tree', transform: { x: random.rand(0, 480), y: random.rand(0, 320) } });
 *     }
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Math
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useRandom = (): TRandomHandle => {
    const store = getActiveGame();
    if (store === null) {
        throw new Error('[NacatamalOn] useRandom: call it inside a scene body.');
    }
    return store.get('random').rng;
};
