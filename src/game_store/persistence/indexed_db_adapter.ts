import type { TStorePersistence } from './types/t_store_persistence';

/**
 * Saves a store in the browser's IndexedDB: for bigger saves than `localStorage` holds, or several
 * save slots.
 *
 * Every store using the same `dbName` shares one table (`storeName`), each under its own key. The state
 * is stored as it is, without turning it into text first. The database is opened on each operation;
 * the browser keeps the connection, so the adapter itself holds nothing.
 *
 * Unlike `localStorageAdapter`, a failure here rejects, and the store warns about it and carries on.
 *
 * The state's type defaults to `any` on purpose: written in place (`adapter: localStorageAdapter()`)
 * the adapter cannot know the store's state yet, and `unknown` would not fit it. The store's own
 * `state` is what decides the type.
 *
 * @param dbName The database, shared by every store that names it.
 * @param storeName The table inside it. Default `'stores'`.
 * @returns An adapter for `persist: { adapter }`.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const indexedDbAdapter = <S = any>(dbName: string, storeName = 'stores'): TStorePersistence<S> => {
    const open = (): Promise<IDBDatabase> =>
        new Promise((resolve, reject) => {
            const request = globalThis.indexedDB.open(dbName, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(storeName)) {
                    request.result.createObjectStore(storeName);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

    return {
        load: async (key) => {
            const db = await open();
            return new Promise<S | null>((resolve, reject) => {
                const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
                request.onsuccess = () => resolve((request.result as S | undefined) ?? null);
                request.onerror = () => reject(request.error);
            });
        },
        save: async (key, state) => {
            const db = await open();
            return new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(storeName, 'readwrite');
                transaction.objectStore(storeName).put(state, key);
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
        },
    };
};
