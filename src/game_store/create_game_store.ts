import { loadByItself } from './store_loads';
import { placeOfAdapter } from './persistence/adapter_place';
import { whenPageGoes } from './persistence/when_page_goes';
import { bumpVersion, markWatchable } from '../store';
import { saysMilliseconds } from '../utils/says_milliseconds';
import { adoptProvisionalStore, registerGameStore, storeInternals } from './store_registry';
import type { TStorePersist } from './persistence';
import type { TGameStore, TGameStoreConfig, TStoreListener, TStoreSelector } from './types/t_game_store';

const DEFAULT_THROTTLE = 0.25;

/** Writing less than once a minute is not what a throttle is for: past it, it was milliseconds. */
const LONGEST_THROTTLE = 60;

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
    // What the store being adopted holds, when it was loaded or played with: put back once the code's
    // values and the file's are in, or the player's progress would be wiped by the very code that
    // declares it.
    const before = adopted === null ? undefined : storeInternals.get(adopted);
    const held = adopted !== null && before?.touched === true ? structuredClone(adopted.state) : undefined;
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
    saysMilliseconds('createGameStore', 'persist throttle', throttle, LONGEST_THROTTLE);

    // A list and not a set, like the signals: the same function subscribed twice is two subscriptions.
    // Taken over from the store being adopted, so that whoever was listening to the one the
    // document built is still listening to this one. Losing them would make an adoption look like
    // it worked and leave half the page deaf.
    const subscriptions: Array<() => void> = adopted === null ? [] : storeInternals.get(adopted)?.subscriptions ?? [];

    /**
     * Tells everyone listening. Over a copy, for the same reasons as a signal's `emit`.
     */
    const notify = (): void => {
        // For `useWatch`, which compares this count once a frame.
        bumpVersion(store);
        for (const run of [...subscriptions]) {
            // One removed by an earlier listener of this same change is not called.
            if (!subscriptions.includes(run)) {
                continue;
            }
            try {
                run();
            } catch (error) {
                // One broken listener must not silence the rest.
                console.warn(`[NacatamalOn] store '${key}': a listener threw:`, error);
            }
        }
    };

    // Carried over by an adoption: a load of the store it was is still its load, and a save that store
    // held is this one's to make, where this one saves.
    const pending = before?.pending ?? { reading: null, unread: false, saveAfterLoad: false, timer: null };
    const place = persist === null ? null : placeOfAdapter(persist.adapter);

    /**
     * Lets go of the save the throttle holds. Whether there was one.
     */
    const cancelSave = (): boolean => {
        if (pending.timer === null) {
            return false;
        }
        clearTimeout(pending.timer);
        pending.timer = null;
        return true;
    };

    const save = async (): Promise<void> => {
        cancelSave();
        if (persist === null) {
            return;
        }
        // Asked for while the save is being read, it is what the game wants kept: what is read is too late.
        const overRead = pending.reading !== null;
        pending.reading?.drop();
        pending.saveAfterLoad = false;
        try {
            await persist.adapter.save(key, state);
            // Written because the game said so: what is in the save is known again.
            pending.unread = false;
            // Changed while it was being written, when nothing else could save it.
            if (pending.reading === null && pending.saveAfterLoad) {
                pending.saveAfterLoad = false;
                saveAgain();
            }
        } catch (error) {
            if (overRead) {
                pending.unread = true;
            }
            // A lost save is bad; a game that crashes because of it is worse.
            console.warn(`[NacatamalOn] store '${key}': it could not be saved:`, error);
        }
    };

    /**
     * A trailing throttle, not a debounce. The first change arms the timer and the ones after it are
     * absorbed; when it fires, the latest state is written. A debounce restarts on every change, so a
     * value that changes every frame would push the save back for ever and never write.
     */
    const scheduleSave = (): void => {
        // A change made while the save is being read, or when it could not be, waits: written now, it
        // would go over that save.
        if (pending.reading !== null || pending.unread) {
            pending.saveAfterLoad = true;
            return;
        }
        if (persist === null || mode !== 'auto' || pending.timer !== null) {
            return;
        }
        pending.timer = setTimeout(() => {
            pending.timer = null;
            void save();
        }, throttle * 1000);
    };

    // A change still waiting for its throttle when the page goes is written there and then, or a
    // coin picked up just before the tab was closed would not be in the save. Only in `'auto'`: a
    // store in `'manual'` saves when the game says, and leaving is not saying so.
    // `localStorageAdapter` writes before its first `await`, so it always gets there; an adapter
    // that waits (IndexedDB, a server) may be cut off by the page going.
    if (persist !== null && mode === 'auto') {
        whenPageGoes(() => {
            // Not one it adopted into: that one sees to it.
            if (pending.timer !== null && storeInternals.get(store)?.notify === notify) {
                void save();
            }
        });
    }

    const touch = (): void => {
        const internals = storeInternals.get(store);
        if (internals !== undefined) {
            internals.touched = true;
        }
    };

    const changed = (): void => {
        touch();
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
            // In place: the list is shared with the store that may adopt this one.
            const at = subscriptions.indexOf(run);
            if (at !== -1) subscriptions.splice(at, 1);
        };
    }) as TGameStore<S, A>['subscribe'];

    // The store's own way now, which a load of the one it adopted must use too.
    const saveAgain = (): void => storeInternals.get(store)?.scheduleSave();

    const readSave = async (from: TStorePersist<S>, reading: () => boolean): Promise<boolean> => {
        let saved: S | null;
        try {
            saved = await from.adapter.load(key);
        } catch (error) {
            if (reading()) {
                pending.reading = null;
                // It may be whole: what is played from here is not worth writing over it.
                pending.unread = true;
            }
            console.warn(`[NacatamalOn] store '${key}': it could not be loaded, and it does not save by itself until it is, so as not to write over what is saved. Load it again with load(), or save it with save():`, error);
            return false;
        }
        // The game went on without it, or another took its place: too late to put it in.
        if (!reading()) {
            return false;
        }
        pending.reading = null;
        pending.unread = false;
        const found = saved !== null && typeof saved === 'object';
        if (found) {
            // Over the current state and not instead of it: a field added after the game was saved
            // keeps its default, so old saves keep loading.
            Object.assign(state, saved);
            touch();
        }
        if (pending.saveAfterLoad) {
            pending.saveAfterLoad = false;
            saveAgain();
        }
        if (found) {
            // Not saved again: what was just read is what is already stored.
            notify();
        }
        return found;
    };

    const load = (): Promise<boolean> => {
        if (persist === null) {
            return Promise.resolve(false);
        }
        // One read at a time: asked for again meanwhile, it is the same one.
        if (pending.reading !== null && pending.reading.from === persist) {
            return pending.reading.done;
        }
        // A save already held would be written over what is being read.
        if (cancelSave()) {
            pending.saveAfterLoad = true;
        }
        // Another place's, when its code arrived meanwhile: nobody waits for that one any more.
        pending.reading?.drop();
        let dropped!: (found: boolean) => void;
        const out = new Promise<boolean>((resolve) => { dropped = resolve; });
        const reading: NonNullable<typeof pending.reading> = {
            from: persist,
            done: out,
            drop: () => {
                if (pending.reading === reading) pending.reading = null;
                dropped(false);
            },
        };
        pending.reading = reading;
        reading.done = Promise.race([out, readSave(persist, () => pending.reading === reading)]);
        return reading.done;
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
    storeInternals.set(store, { subscriptions, notify, automatic: persist !== null && mode === 'auto', touched: false, place, pending, scheduleSave });
    markWatchable(store);

    // After the store exists, so an action can reach `set` and `get` the moment it is called.
    (store as { actions: A }).actions = config.actions ? config.actions(set, get) : ({} as A);

    // Registering is a consequence of making a store and not a second step to remember, the same
    // relation `registerScript` has to its registry. Last, so that anything reading the index finds
    // a finished store, and because this is what hands it any authored values that arrived first.
    registerGameStore(store as unknown as TGameStore<Record<string, unknown>, unknown>);
    if (held !== undefined) {
        Object.assign(state, held);
        touch();
        notify();
    }
    // Saved by itself from now on, or somewhere else than its file said: what it saved there another
    // day is read before anything is written over it.
    if (before !== undefined) {
        const held = cancelSave();
        if (persist !== null && mode === 'auto') {
            if (!before.automatic || place === undefined || place !== before.place) {
                void loadByItself(store as unknown as TGameStore<Record<string, unknown>, unknown>);
            } else if (held) {
                scheduleSave();
            }
        }
    }
    return store;
};
