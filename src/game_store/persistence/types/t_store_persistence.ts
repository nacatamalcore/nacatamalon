/**
 * Where a store is saved to and loaded from. Two functions, both asynchronous, both keyed by the
 * store's `key`.
 *
 * The engine ships `localStorageAdapter` and `indexedDbAdapter`, but any storage fits by implementing
 * these two: a server, an external database, a file in a desktop wrapper. `save` receives the live
 * state, which is plain JSON, so it can be sent as it is.
 *
 * @example
 * A server of your own:
 * ```ts
 * const serverAdapter = <S>(baseUrl: string): TStorePersistence<S> => ({
 *     load: async (key) => {
 *         const response = await fetch(`${baseUrl}/saves/${key}`);
 *         return response.ok ? ((await response.json()) as S) : null;
 *     },
 *     save: async (key, state) => {
 *         await fetch(`${baseUrl}/saves/${key}`, {
 *             method: 'PUT',
 *             headers: { 'Content-Type': 'application/json' },
 *             body: JSON.stringify(state),
 *         });
 *     },
 * });
 * ```
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStorePersistence<S> = {
    /**
     * The saved state, or `null` when nothing was saved under `key`.
     */
    load(key: string): Promise<S | null>;
    /**
     * Writes `state` under `key`.
     */
    save(key: string, state: S): Promise<void>;
};

/**
 * How a store saves itself.
 *
 * - `mode: 'auto'`, the default: the store saves on its own after it changes, at most once every
 *   `throttle` milliseconds. A value changed on every frame still saves regularly.
 * - `mode: 'manual'`: the store only saves when `save()` is called. A save point: the game lives in
 *   memory and is only written when the player reaches the typewriter.
 *
 * In both modes `load()` reads what was saved; call it once when the game starts.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStorePersist<S> = {
    /**
     * Where to save: `localStorageAdapter()`, `indexedDbAdapter(name)` or one of your own.
     */
    adapter: TStorePersistence<S>;
    /**
     * Default `'auto'`.
     */
    mode?: 'auto' | 'manual';
    /**
     * In `'auto'`, the shortest time between two saves, in milliseconds. Default `250`.
     */
    throttle?: number;
};
