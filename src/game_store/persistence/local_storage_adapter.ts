import { placeAdapter } from './adapter_place';
import type { TStorePersistence } from './types/t_store_persistence';

/**
 * Saves a store in the browser's `localStorage`, as JSON under the store's key.
 *
 * Right for small state that is always on: options, a score table, a pet. `localStorage` holds a few
 * megabytes per site and every write is synchronous; for bigger saves use `indexedDbAdapter`.
 *
 * A failure (storage full, disabled by the browser) is the store's to say: it warns, and the game
 * carries on. A save that is not valid JSON is kept aside, under the key and `.unreadable`, and the
 * game carries on as if there were none.
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
export const localStorageAdapter = <S = any>(): TStorePersistence<S> => placeAdapter({
    load: async (key) => {
        const raw = globalThis.localStorage.getItem(key);
        if (raw === null) {
            return null;
        }
        try {
            return JSON.parse(raw) as S;
        } catch (error) {
            // Never readable, so waiting to read it would stop the store saving for good; kept aside, so
            // nothing is lost by going on.
            globalThis.localStorage.setItem(`${key}.unreadable`, raw);
            console.warn(`[NacatamalOn] localStorageAdapter: '${key}' is not valid JSON, so what the game declares is used. What there was is kept as '${key}.unreadable'.`, error);
            return null;
        }
    },
    save: async (key, state) => {
        globalThis.localStorage.setItem(key, JSON.stringify(state));
    },
}, 'localStorage');
