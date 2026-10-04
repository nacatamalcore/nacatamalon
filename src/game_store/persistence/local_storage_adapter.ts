import type { TStorePersistence } from './types/t_store_persistence';

/**
 * Saves a store in the browser's `localStorage`, as JSON under the store's key.
 *
 * Right for small state that is always on: options, a score table, a pet. `localStorage` holds a few
 * megabytes per site and every write is synchronous; for bigger saves use `indexedDbAdapter`.
 *
 * A failure (storage full, disabled by the browser, a save that is not valid JSON) is warned about and
 * never thrown: the game carries on, as if there were no save.
 *
 * The state's type defaults to `any` on purpose: written in place (`adapter: localStorageAdapter()`)
 * the adapter cannot know the store's state yet, and `unknown` would not fit it. The store's own
 * `state` is what decides the type.
 *
 * @returns An adapter for `persist: { adapter }`.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const localStorageAdapter = <S = any>(): TStorePersistence<S> => ({
    load: async (key) => {
        try {
            const raw = globalThis.localStorage.getItem(key);
            return raw === null ? null : (JSON.parse(raw) as S);
        } catch (error) {
            console.warn(`[NacatamalOn] localStorage: '${key}' could not be read.`, error);
            return null;
        }
    },
    save: async (key, state) => {
        try {
            globalThis.localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.warn(`[NacatamalOn] localStorage: '${key}' could not be saved.`, error);
        }
    },
});
