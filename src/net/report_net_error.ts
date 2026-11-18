import type { TRuntimeStore } from '../store';

/**
 * Where each game on the network runs, as an error says it: a room of the server by its name, or a
 * player's game. Set by `netGameOf`, so the sharing and the room stores can say it without reaching
 * for the game themselves.
 */
const places = new WeakMap<TRuntimeStore, () => string>();

/**
 * Says where a game on the network runs, for its errors.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const describeNetGame = (store: TRuntimeStore, where: () => string): void => {
    places.set(store, where);
};

/**
 * Keeps the error something of the network's threw (a listener, an object's `move`, a spawner, a
 * room store's watcher), if it is the first, and says once what it was and where: in a room of the
 * server or in a player's game. As a scene's update that throws: it costs only itself, and the
 * game hears it through `game.on('error')`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const reportNetError = (store: TRuntimeStore, error: unknown, what: string): void => {
    if (store.get('loop').failure !== null) {
        return;
    }
    const failure = error instanceof Error ? error : new Error(String(error));
    const where = places.get(store)?.() ?? 'a game';
    console.error(`[NacatamalOn] useNet: ${what} threw, in ${where}. What it was doing is lost each time; everything else goes on.`, failure);
    store.setState('loop', { failure });
};
