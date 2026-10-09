import { createGameHandle } from '../../game/handle';
import type { TGameHandle } from '../../game/handle';
import { getActiveGame } from '../../store';

/**
 * The game itself: its size, its background, whether images are kept crisp, how fast time runs,
 * and whether everything is frozen.
 *
 * These are the settings that belong to the whole game rather than to one scene, and until now
 * they could only be chosen once, when the game was created. This is how a pause menu, an options
 * screen or a boss entrance changes them while it runs.
 *
 * Call it while the scene is being built, like every hook, and keep what it returns: the handle
 * stays live, so reading it in a frame long afterwards still gives today's answer.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const game = useGame();
 *     const keys = useKeyboard();
 *
 *     useUpdate(() => {
 *         // A pause menu: everything stops, everything is still drawn.
 *         if (keys.justPressed('Escape')) {
 *             game.isPaused() ? game.resume() : game.pause();
 *         }
 *         // Slow motion while the key is held.
 *         game.setTimeScale(keys.isDown('Shift') ? 0.25 : 1);
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @returns The game's handle: see {@link TGameHandle}.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useGame = (): TGameHandle => {
    const store = getActiveGame();
    if (store === null) {
        throw new Error('[NacatamalOn] useGame: call it inside a scene body. In a React component, import useGame from \'nacatamalon/react\' instead.');
    }
    return createGameHandle(store);
};
