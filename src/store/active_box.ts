import type { TBox } from '../box';
import { getActiveGame } from './active_game';
import type { TRuntimeStore } from './types/t_runtime_store';

/**
 * Runs `fn` with `box` as the box being built, and takes it off again afterwards.
 *
 * What lets a hook called inside a component body know which box it belongs to. The stack
 * lives in each game's store, so two games never share it. The `finally` is the point: a body
 * that throws still leaves the stack as it found it, instead of hanging the next hook on a
 * dead box.
 *
 * **`fn` must be synchronous**, for the same reason as `withActiveGame`: an `await` crosses a
 * microtask with the box still on the stack.
 *
 * @category Boxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const withActiveBox = <T>(store: TRuntimeStore, box: TBox, fn: () => T): T => {
    const { boxStack } = store.get('world');
    boxStack.push(box);
    try {
        return fn();
    } finally {
        boxStack.pop();
    }
};

/**
 * The box being built right now in the active game, or `null` outside a build.
 * @returns The object being built, or `null`.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getActiveBox = (): TBox | null => {
    const game = getActiveGame();
    if (game === null) return null;
    const { boxStack } = game.get('world');
    return boxStack[boxStack.length - 1] ?? null;
};
