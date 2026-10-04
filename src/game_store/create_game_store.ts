import { adoptProvisionalStore, registerGameStore, storeInternals } from './store_registry';
import type { TGameStore, TGameStoreConfig, TStoreListener, TStoreSelector } from './types/t_game_store';

const DEFAULT_THROTTLE = 250;

/**
 * Makes a store: data of the game that outlives a scene (lives, coins, options, a pet), with a way to
 * be told when it changes and, optionally, to be saved and loaded.
 *
 * A signal says that something **happened**; a store holds what **is still true**. Make it once, in a
 * file of its own, and import it wherever it is needed: like a signal, it belongs to the page, not to
 * a scene or a game.
 *
 * - Read: `store.state.hunger`, anywhere.
 * - Change: an action, or `store.set((s) => { s.hunger -= 1; })`. The state is changed in place.
 * - React: `useStore(store, selector, handler)` in a scene, `store.subscribe(...)` anywhere else.
 *   Everyone listening is told straight away, inside the `set` that changed it.
 * - Keep it: `persist` with `localStorageAdapter()`, `indexedDbAdapter(name)` or an adapter of your
 *   own, then `load()` when the game starts.
 *
 * @example
 * ```ts
 * declare const pet: TSprite;
 * const GREEN = getColor('#40c040');
 * const RED = getColor('#e04040');
 *
 * // stores/pet.ts
 * export const petStore = createGameStore({
 *     key: 'pet',
 *     state: { hunger: 70, timesFed: 0 },
 *     actions: (set) => ({
 *         feed: () => set((s) => { s.hunger = Math.min(100, s.hunger + 15); s.timesFed++; }),
 *     }),
 *     persist: { adapter: localStorageAdapter() },
 * });
 *
 * // when the game starts
 * await petStore.load();
 *
 * // in a scene
 * useStore(petStore, (s) => s.hunger > 30, (content) => { pet.tint = content ? GREEN : RED; });
 * ```
 * @param config - Its `key`, its starting `state`, its `actions`, and how it saves itself (`persist`).
 * @returns The store: its `state`, its `actions`, `set`, `subscribe`, `load` and `reset`.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createGameStore = <S extends object, A = Record<string, never>>(
    config: TGameStoreConfig<S, A>,
): TGameStore<S, A> => {
    const { key } = config;

    // A store a document built because no code had declared one **yet** is adopted, not duplicated:
    // this call is the code that was missing. Keeping the object keeps alive every reference taken
    // in the meantime, an object's link that already resolved or a panel already watching, which a
    // second store under the same key would leave pointing at something nothing updates again.
    const adopted = adoptProvisionalStore(key) as unknown as TGameStore<S, A> | null;

    const state = adopted === null ? config.state : adopted.state;
    if (adopted !== null) {
        // Emptied and refilled in place, so the identity of `state` survives the adoption as well.
        // The code's values are the floor; the file's land back on top when the store registers.
        for (const field of Object.keys(state)) {
            delete (state as Record<string, unknown>)[field];
        }
        Object.assign(state, config.state);
    }

    // A copy taken now, before anything changes the state (the object given is the live one), so a
    // reset goes back to what the store was declared with.
    const initial = structuredClone(config.state);

    const persist = config.persist ?? null;
    const mode = persist?.mode ?? 'auto';
    const throttle = persist?.throttle ?? DEFAULT_THROTTLE;

    // A list and not a set, like the signals: the same function subscribed twice is two subscriptions.
    // Taken over from the store being adopted, so that whoever was listening to the one the
    // document built is still listening to this one. Losing them would make an adoption look like
    // it worked and leave half the page deaf.
    let subscriptions: Array<() => void> = adopted === null ? [] : storeInternals.get(adopted)?.subscriptions ?? [];

    /**
     * Tells everyone listening. Over a copy, for the same reasons as a signal's `emit`.
     */
    const notify = (): void => {
        for (const run of [...subscriptions]) {
            // One removed by an earlier listener of this same change is not called.
            if (!subscriptions.includes(run)) {
                continue;
            }
            try {
                run();
            } catch (error) {
                // One broken listener must not silence the rest.
                console.warn(`[NacatamalOn] A listener of the store '${key}' threw:`, error);
            }
        }
    };

    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    const save = async (): Promise<void> => {
        if (saveTimer !== null) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        if (persist === null) {
            return;
        }
        try {
            await persist.adapter.save(key, state);
        } catch (error) {
            // A lost save is bad; a game that crashes because of it is worse.
            console.warn(`[NacatamalOn] The store '${key}' could not be saved:`, error);
        }
    };

    /**
     * A trailing throttle, not a debounce. The first change arms the timer and the ones after it are
     * absorbed; when it fires, the latest state is written. A debounce restarts on every change, so a
     * value that changes every frame would push the save back for ever and never write.
     */
    const scheduleSave = (): void => {
        if (persist === null || mode !== 'auto' || saveTimer !== null) {
            return;
        }
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void save();
        }, throttle);
    };

    const changed = (): void => {
        scheduleSave();
        notify();
    };

    const set: TGameStore<S, A>['set'] = (change) => {
        change(state);
        changed();
    };
    const get = (): S => state;

    const subscribe = (<T>(
        selectorOrListener: TStoreSelector<S, T> | (() => void),
        listener?: TStoreListener<T>,
        equals: (a: T, b: T) => boolean = Object.is,
    ): (() => void) => {
        let run: () => void;
        if (listener === undefined) {
            // Its own function, so subscribing the same one twice gives two subscriptions.
            const plain = selectorOrListener as () => void;
            run = () => plain();
        } else {
            const selector = selectorOrListener as TStoreSelector<S, T>;
            let previous = selector(state);
            run = () => {
                const value = selector(state);
                if (equals(previous, value)) {
                    return;
                }
                // Moved on before the listener runs: a `set` inside it compares against this value,
                // not the old one, and does not report the same change twice.
                const old = previous;
                previous = value;
                listener(value, old);
            };
        }
        subscriptions.push(run);
        return () => {
            subscriptions = subscriptions.filter((existing) => existing !== run);
        };
    }) as TGameStore<S, A>['subscribe'];

    const load = async (): Promise<boolean> => {
        if (persist === null) {
            return false;
        }
        let saved: S | null;
        try {
            saved = await persist.adapter.load(key);
        } catch (error) {
            console.warn(`[NacatamalOn] The store '${key}' could not be loaded:`, error);
            return false;
        }
        if (saved === null || typeof saved !== 'object') {
            return false;
        }
        // Over the current state and not instead of it: a field added after the game was saved keeps
        // its default, so old saves keep loading.
        Object.assign(state, saved);
        // Not saved again: what was just read is what is already stored.
        notify();
        return true;
    };

    const reset = (): void => {
        // Emptied and refilled in place: whoever kept `store.state` still holds the live object.
        for (const field of Object.keys(state)) {
            delete (state as Record<string, unknown>)[field];
        }
        Object.assign(state, structuredClone(initial));
        changed();
    };

    const store = adopted ?? ({} as TGameStore<S, A>);
    Object.assign(store, {
        key,
        state,
        actions: {} as A,
        set,
        get,
        subscribe,
        save,
        load,
        reset,
    });
    storeInternals.set(store, { subscriptions, notify });

    // After the store exists, so an action can reach `set` and `get` the moment it is called.
    (store as { actions: A }).actions = config.actions ? config.actions(set, get) : ({} as A);

    // Registering is a consequence of making a store and not a second step to remember, the same
    // relation `registerScript` has to its registry. Last, so that anything reading the index finds
    // a finished store, and because this is what hands it any authored values that arrived first.
    registerGameStore(store as unknown as TGameStore<Record<string, unknown>, unknown>);
    return store;
};
