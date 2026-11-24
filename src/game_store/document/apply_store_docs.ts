import { createGameStore } from '../create_game_store';
import { indexedDbAdapter, localStorageAdapter } from '../persistence';
import { loadByItself } from '../store_loads';
import { getGameStore, markProvisionalStore, setStoreDefaults, storeInternals } from '../store_registry';
import type { TStoreDoc } from './t_store_doc';
import type { TStorePersist } from '../persistence';

/**
 * The state a document describes, as an ordinary object.
 */
const stateFromDoc = (doc: TStoreDoc): Record<string, unknown> => {
    const state: Record<string, unknown> = {};
    for (const field of doc.fields) {
        state[field.name] = typeof field.value === 'object' && field.value !== null ? { ...field.value } : field.value;
    }
    return state;
};

/**
 * How a document says the store saves itself, built into the real thing.
 */
const persistFromDoc = (doc: TStoreDoc): TStorePersist<Record<string, unknown>> | undefined => {
    const persist = doc.persist;
    if (persist === undefined) {
        return undefined;
    }
    return {
        adapter: persist.adapter === 'indexedDb'
            ? indexedDbAdapter(persist.dbName ?? 'nacatamalon')
            : localStorageAdapter(),
        ...(persist.mode !== undefined ? { mode: persist.mode } : {}),
        ...(persist.throttle !== undefined ? { throttle: persist.throttle } : {}),
    };
};

/**
 * Installs what a project's store files say: over the stores that exist, and as stores of their own
 * for the ones nothing has declared.
 *
 * **Both halves matter and they are not the same.** Over an existing store it is a layer: the code
 * declared the floor and the file lands on top of it key by key, so a field the file does not
 * mention keeps what the code gave it. For a key no code has declared it builds the store outright,
 * which is what lets a tool add state to a project with no file to write and no module to import.
 *
 * A store built that way is held as **waiting for its code**: if the file that declares it turns up
 * later, `createGameStore` takes over that very object instead of making a second one. That is the
 * ordinary order inside an editor, where the stores of a project are read when it opens and the
 * code that declares one only runs when a scene reaches for it.
 *
 * It can be called at any point in a start-up, which is the property to keep: a packaged game
 * imports its stores while the modules evaluate, long before this runs, and an editor does it the
 * other way round.
 *
 * **Then it loads what each of those stores saved**, the file's or the code's way of saving
 * (`persist`), and `createGame` waits for them before the first scene: a game that is opened again
 * carries on where it was left (its records, what it unlocked) instead of starting from what the
 * files say, with nothing to await. What starts a scene at once (a headless game, a server's room)
 * awaits the promise it hands back, done when they have all been read. A store that saves nothing is passed by, as is one in
 * `'manual'` mode, which the game loads when it says (a "Continue" in its title); and a save
 * that cannot be read is warned about and leaves the store as the files say.
 *
 * @example
 * ```ts
 * // src/main.ts, before createGame
 * applyStoreDocs([parseStoreDoc(await (await fetch('stores/records.store')).json(), 'stores/records.store')]);
 * ```
 * @param docs The files, already read with `parseStoreDoc`.
 * @returns Done when every store the files name has loaded its save.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const applyStoreDocs = (docs: readonly TStoreDoc[]): Promise<void> => {
    const named = new Set<string>();
    for (const doc of docs) {
        if (doc.key === '') {
            console.warn('[NacatamalOn] applyStoreDocs: a store file with no key was skipped. A store is found by its name, so a file without one can never be reached.');
            continue;
        }
        named.add(doc.key);
        const state = stateFromDoc(doc);
        setStoreDefaults(doc.key, state);

        if (getGameStore(doc.key) !== null) {
            continue;
        }
        // Nothing has declared this one, so the file is all there is. Made through the ordinary
        // door, so it is an ordinary store in every way, and then marked as waiting: the code that
        // was missing adopts this object rather than replacing it.
        const persist = persistFromDoc(doc);
        createGameStore({
            key: doc.key,
            state,
            ...(persist !== undefined ? { persist } : {}),
        });
        markProvisionalStore(doc.key);
    }
    // After every file has landed, so a save goes over the files and not the other way round.
    const loads = [...named].map((key) => {
        const store = getGameStore(key);
        return store !== null && storeInternals.get(store)?.automatic ? loadByItself(store) : false;
    });
    return Promise.all(loads).then(() => undefined);
};
