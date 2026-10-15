import { getActiveGame } from '../store/active_game';

/**
 * How long one step of a simulation is when the game runs on the screen's time: 1/60 s, whatever
 * the screen, so a stack of boxes settles the same on every machine.
 */
const DEFAULT_STEP = 1 / 60;

/**
 * Hands a physics world the length of its step, read again every time it is asked.
 *
 * A game with a fixed `step` steps its simulation by exactly that, once per step of the game: at
 * `step: 50` a world that kept its own 1/60 would fit six steps into five of the game's, one,
 * one, one, one, two, and bodies would move unevenly against everything else. On the screen's
 * time the world keeps its own 1/60, carried over between frames.
 *
 * Called while the world is being built, where the game is known; the length is looked up live, so
 * a game whose `step` changes while it runs (an editor's settings) steps by the new one.
 *
 * @internal
 */
export const physicsStepOf = (): (() => number) => {
    const store = getActiveGame();
    return () => {
        const rate = store?.get('config').step;
        return typeof rate === 'number' ? 1 / rate : DEFAULT_STEP;
    };
};
