import { storeInternals, storeLoads } from './store_registry';
import type { TGameStore } from './types/t_game_store';

type TAnyStore = TGameStore<Record<string, unknown>, unknown>;

/**
 * Loads a store that saves itself, and remembers it is being read until it is, for a game that
 * starts meanwhile to wait for it.
 *
 * @internal
 */
export const loadByItself = (store: TAnyStore): Promise<unknown> => {
    const load: Promise<unknown> = store.load().finally(() => {
        if (storeLoads.get(store) === load) storeLoads.delete(store);
    });
    storeLoads.set(store, load);
    return load;
};

/**
 * Waits for the stores being read, or `null` when none is: a game with nothing to wait for starts
 * with no wait at all.
 *
 * One that has not answered within `limit` seconds is gone on without: what it saved is left as it
 * is, neither put in the game in the middle of being played nor written over by itself, so it is
 * there the next time.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const storesRead = (limit: number): Promise<void> | null => {
    if (storeLoads.size === 0) {
        return null;
    }
    let timer: ReturnType<typeof setTimeout>;
    let over = false;
    const late = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
            over = true;
            for (const store of storeLoads.keys()) {
                const pending = storeInternals.get(store)?.pending;
                // Saved by the game meanwhile, it is not being read.
                if (pending === undefined || pending.reading === null) continue;
                pending.reading.drop();
                pending.unread = true;
                console.warn(`[NacatamalOn] store '${store.key}': what it saved has not been read in ${limit} seconds, so the game starts without it, and the store does not save by itself until it is read. Read it again with load().`);
            }
            storeLoads.clear();
            resolve();
        }, limit * 1000);
    });
    // Until none is left: one whose code arrives meanwhile and saves it elsewhere is read again there.
    const all = async (): Promise<void> => {
        while (storeLoads.size > 0 && !over) {
            await Promise.race([Promise.allSettled([...storeLoads.values()]), late]);
        }
    };
    return all().finally(() => clearTimeout(timer));
};
