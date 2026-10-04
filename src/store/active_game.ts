import type { TRuntimeStore } from './types/t_runtime_store';

/**
 * Which game is initialising right now.
 *
 * The one piece of module-level state the engine has, and it has to be: a hook called inside
 * a component body (`useUpdate(...)`) receives no argument saying which game it belongs to,
 * so the only way it can know is by asking who is running.
 *
 * It is also the only place two games on one page can collide, which is why nothing writes
 * it directly: `withActiveGame` is the door.
 */
let active: TRuntimeStore | null = null;

/**
 * The game whose scene is being built right now, or `null` outside that.
 *
 * An extension asks this while a scene is put together, so that what it makes belongs to that game:
 * two games on one page each get their own.
 * @returns The game, or `null` outside a scene being built.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getActiveGame = (): TRuntimeStore | null => active;

/**
 * Runs `fn` with `store` as the active game, and restores whatever was active before.
 *
 * A function rather than a `setActiveGame(store)` / `setActiveGame(null)` pair, because that
 * pair only works if every caller remembers a `try`/`finally`. Here it cannot be forgotten:
 * a scene that throws mid-init still leaves the pointer as it found it, instead of poisoning
 * every `createGame` that comes after it on the page.
 *
 * It restores the **previous** value, not `null`, so a scene launched during another scene's
 * init does not clear the outer context on its way out.
 *
 * **`fn` must be synchronous.** Holding the pointer across an `await` crosses a microtask,
 * and another game's init can run in the middle and read the wrong one. Anything async,
 * waiting on a scene's textures for instance, belongs *after* this returns.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const withActiveGame = <T>(store: TRuntimeStore, fn: () => T): T => {
    const previous = active;
    active = store;

    try {
        return fn();
    } finally {
        active = previous;
    }
};
