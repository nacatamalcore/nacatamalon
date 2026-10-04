import type { TStorePersist } from '../persistence/types/t_store_persistence';

/**
 * Changes a store: receives the live state and changes it in place.
 *
 * ```ts
 * set((s) => { s.hunger -= 1; });
 * ```
 *
 * The state is changed, not replaced, the same way a sprite is moved by changing its `transform`: no
 * copy per change, even for a value that changes on every frame.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStoreSet<S> = (change: (state: S) => void) => void;

/**
 * Reads a store's live state.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStoreGet<S> = () => S;

/**
 * Builds a store's actions from its `set` and `get`.
 *
 * A function and not an object, so the actions can use `set` and `get`, and so a big store can be put
 * together from several files: each file returns some actions and the store spreads them into one.
 *
 * ```ts
 * actions: (set, get) => ({ ...careActions(set, get), ...lifeActions(set, get) }),
 * ```
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStoreActionsFactory<S, A> = (set: TStoreSet<S>, get: TStoreGet<S>) => A;

/**
 * Picks one value out of a store's state, to be told only when that value changes.
 *
 * Pick values, not objects: the state is changed in place, so `(s) => s.inventory` returns the same
 * object every time and never looks changed. `(s) => s.inventory.length` does.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStoreSelector<S, T> = (state: S) => T;

/**
 * Told that a selected value changed: the new value and the one before.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStoreListener<T> = (value: T, previous: T) => void;

/**
 * What `createGameStore` is given.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameStoreConfig<S, A> = {
    /**
     * The name it is saved under. Different stores need different keys.
     */
    key: string;
    /**
     * The state a new game starts with, and what `reset()` goes back to. Plain JSON only.
     */
    state: S;
    /**
     * The store's actions. Optional: a store can also be changed with `set` directly.
     */
    actions?: TStoreActionsFactory<S, A>;
    /**
     * Saving and loading. Without it, the store lives only while the page is open.
     *
     * `NoInfer`, so the state's type comes from `state` alone: an adapter written in place
     * (`adapter: localStorageAdapter()`) is generic and knows nothing yet, and left to vote it
     * would turn the whole state into `object` and every action into an error.
     */
    persist?: TStorePersist<NoInfer<S>>;
};

/**
 * Data of the game that outlives a scene: lives, coins, the options, a pet. Made with
 * `createGameStore`, once, in a file of its own, and imported wherever it is needed.
 *
 * `state` is plain JSON, which is what gets saved. Everything else (`actions`, `set`, `subscribe`...)
 * is how the game reads and changes it.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameStore<S, A = Record<string, never>> = {
    /**
     * The name it is saved under.
     */
    readonly key: string;
    /**
     * The live state. Read it anywhere; change it through an action or `set`, so whoever listens is
     * told.
     */
    readonly state: S;
    /**
     * The actions given to `createGameStore`.
     */
    readonly actions: A;
    /**
     * Changes the state in place and tells everyone listening, straight away.
     */
    set: TStoreSet<S>;
    /**
     * The live state, the same object as `state`.
     */
    get: TStoreGet<S>;
    /**
     * Starts listening. With only a listener, it is called after every change. With a selector, only
     * when the selected value changes (by `Object.is`, or by `equals`), with the new and the old
     * value. Returns the function that stops.
     *
     * Inside a scene prefer `useStore`, which stops by itself when the scene goes away.
     */
    subscribe: {
        (listener: () => void): () => void;
        <T>(selector: TStoreSelector<S, T>, listener: TStoreListener<T>, equals?: (a: T, b: T) => boolean): () => void;
    };
    /**
     * Saves now, whatever the mode. Does nothing without `persist`.
     */
    save(): Promise<void>;
    /**
     * Reads the saved state and puts it over the current one: a field the save does not have keeps
     * its value, so a save from an older version of the game still loads. Resolves to `true` if
     * there was a save.
     */
    load(): Promise<boolean>;
    /**
     * Goes back to the state the store was created with: a new game.
     */
    reset(): void;
};
