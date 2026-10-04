import type { TGameEventName, TGameEvents } from './t_game_events';

/**
 * What the second call of `createGame` returns: the handle to a running game.
 *
 * `destroy` - Stops the loop, releases the renderer and the store, and removes the canvas. Safe to call at any time; subsequent calls have no effect.
 *
 * `on` - Listens to what the game tells the page around it: `'ready'`, `'error'` and `'destroy'`.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameInstance = {
    /**
     * Stops the loop, releases the renderer and the store, and removes the canvas.
     */
    destroy(): void;
    /**
     * Listens to one of the game's events, and returns the function that stops listening.
     *
     * The three of them happen once in the life of a game, so **arriving late is not missing
     * them**: a listener added after the game is ready is called straight away with the handle, and
     * the same for `'error'` and `'destroy'`. Without that, a page that subscribed a moment too late
     * would wait forever for something that had already happened.
     *
     * Nothing is heard after `'destroy'`: a renderer that answers after the game was taken down
     * starts nothing, so there is no `'ready'` to announce.
     *
     * @example
     * ```ts
     * const game = createGame('#app', { width: 480, height: 320 })({ Level });
     *
     * game.on('ready', (handle) => console.log(handle.getBackend()));
     * game.on('error', (error) => showMessage(error.message));
     * ```
     */
    on<E extends TGameEventName>(event: E, handler: (payload: TGameEvents[E]) => void): () => void;
};
