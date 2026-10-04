import type { TRuntimeStore } from './types/t_runtime_store';

/**
 * The games that are running their scenes' updates right now.
 *
 * A set beside the state and not a field inside it, for two reasons: the state is read through a
 * readonly view, and this is not something the game owns. It is a phase of the frame, it exists
 * for microseconds at a time, and nothing subscribes to it.
 */
const runningUpdates = new WeakSet<TRuntimeStore>();

/**
 * Runs `fn` with this game marked as running its scenes' updates, and unmarks it afterwards even
 * if `fn` throws: a mark left on would make every later `destroy({ immediate: true })` defer for
 * good.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const withSceneUpdates = <T>(store: TRuntimeStore, fn: () => T): T => {
    runningUpdates.add(store);
    try {
        return fn();
    } finally {
        runningUpdates.delete(store);
    }
};

/**
 * Whether this game is inside its update pass, which is the same as asking whether its scenes can
 * be changed right now. Read by `destroy` before it takes anything out on the spot.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isRunningUpdates = (store: TRuntimeStore): boolean => runningUpdates.has(store);
