import type { TGameStore } from './types/t_game_store';

/**
 * A store held by the index, with its state and actions widened. Every function here is about
 * "some store", so the shapes are opened once at the boundary instead of being threaded through.
 */
type TAnyStore = TGameStore<Record<string, unknown>, unknown>;

/**
 * The index of every store this page has made, and of the authored values waiting for them.
 *
 * **A store is a module singleton, which is exactly what makes it global and exactly what makes it
 * invisible**: nothing enumerates it, so no tool can list a project's state, show it or edit it.
 * This is the index that closes that hole, the same relation the script registry has to
 * `registerScript`.
 *
 * The property that matters and that is easy to lose is that it is **independent of the order
 * things happen in**. Authored values can arrive before the store that receives them (a tool reads
 * `stores/` when it opens a project, and the file that declares the store only runs when a scene
 * asks for it) or after (a packaged game imports its stores while the modules evaluate, long before
 * `createGame`). Both work here: values land on the stores that exist and wait under their key for
 * the ones that do not. A version that only looked forwards would pass every test somebody ran in
 * an editor and quietly ignore every authored value in the shipped build, which is a failure that
 * only appears in production.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */

/**
 * key to the live store.
 */
const stores = new Map<string, TAnyStore>();

/**
 * key to the authored layer (its `.store` file), whether it has been applied yet or not.
 */
const authored = new Map<string, Record<string, unknown>>();

/**
 * The keys whose store was built from a document because no code had declared one **yet**.
 *
 * "Yet" is the whole point. A tool reads a project's stores when it opens it, and the file that
 * declares one only runs when a scene reaches for it, so the ordinary order there is: read the
 * files, build what nothing has declared, and *then* watch the code that declares it arrive.
 * Without this the second step would make a second store under the same key, the index would keep
 * the newer one, and anything that reached the first in the meantime (an object's link, a panel)
 * would be left holding something nothing will ever update again.
 */
const provisional = new Set<string>();

/**
 * The pieces of a store that only the index is allowed to touch, by store.
 *
 * Two of them, and both exist so that adopting a store is not half an adoption. `subscriptions` is
 * the live list, so whoever was listening to a store built from a file is still listening after the
 * code that declares it takes it over. `notify` tells them about a change **without it counting as
 * a change the game made**: laying an authored layer over a store must not schedule a save, or a
 * game would write its own defaults over the player's save file on the way to reading it.
 *
 * @internal
 */
export const storeInternals = new WeakMap<object, { subscriptions: Array<() => void>; notify: () => void }>();

/**
 * Puts the authored layer over a store's live state, in place, and tells whoever is listening.
 */
const applyAuthored = (store: TAnyStore): void => {
    const values = authored.get(store.key);
    if (values === undefined) {
        return;
    }
    // Shallow, and deliberately: it is the same merge `load()` does over a save file, so a field
    // the document does not mention keeps the value the code gave it and a store that **gains** a
    // field costs no migration at all.
    Object.assign(store.state, values);
    storeInternals.get(store)?.notify();
};

/**
 * Puts a store in the index. Called by `createGameStore` itself, so registering is a consequence of
 * making one rather than a second step somebody has to remember.
 *
 * @internal
 */
export const registerGameStore = (store: TAnyStore): void => {
    const existing = stores.get(store.key);
    if (existing !== undefined && existing !== store) {
        // Two stores under one key share a hole to save in, so each would write over the other's
        // saved game. Nothing here can mend that, but saying it as it happens is the difference
        // between a puzzling bug about saves and a typo somebody fixes in ten seconds.
        console.warn(`[NacatamalOn] createGameStore: two stores are called '${store.key}'. They will write over each other's saved state.`);
    }
    stores.set(store.key, store);
    provisional.delete(store.key);
    applyAuthored(store);
};

/**
 * Marks a store already in the index as one a document built on its own, with no code behind it.
 *
 * A flag set afterwards rather than an argument to `createGameStore`, so that the public way of
 * making a store has no notion of this at all.
 *
 * @internal
 */
export const markProvisionalStore = (key: string): void => {
    if (stores.has(key)) {
        provisional.add(key);
    }
};

/**
 * Hands back the document-built store waiting under this key, and stops treating it as waiting:
 * whoever is asking is the code that was missing, and is about to fill it in.
 *
 * `null` when nothing is waiting **or** when what is waiting was itself declared by code, which is
 * the real duplicate-key mistake and has to stay visible instead of being merged away quietly.
 *
 * @internal
 */
export const adoptProvisionalStore = (key: string): TAnyStore | null => {
    if (!provisional.has(key)) {
        return null;
    }
    provisional.delete(key);
    return stores.get(key) ?? null;
};

/**
 * Whether the store under this key was built from its file alone, with no code behind it.
 *
 * An editor asks so it can say where a store came from: one declared in code has actions and a
 * shape the code owns, and one that only exists because a `.store` file named it has neither yet.
 * A game never needs to ask, since the code that would adopt the store is the game's own.
 * @param key - The store's name.
 * @returns Whether it came from its file alone.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isProvisionalStore = (key: string): boolean => provisional.has(key);

/**
 * Remembers what a `.store` file says, and lays it over that store if it already exists.
 *
 * @internal
 */
export const setStoreDefaults = (key: string, values: Record<string, unknown>): void => {
    authored.set(key, { ...values });
    const store = stores.get(key);
    if (store !== undefined) {
        applyAuthored(store);
    }
};

/**
 * One store by its key, or `null`.
 *
 * This is what an object's store link resolves through, and the whole reason it can: a behaviour
 * reaches state it did not define without an `import` naming a file it cannot know the path of.
 * @param key - The store's name, as `createGameStore` was given it.
 * @returns The store, or `null`.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getGameStore = (key: string): TGameStore<Record<string, unknown>, unknown> | null =>
    stores.get(key) ?? null;

/**
 * Every store this page has made, in no particular order.
 *
 * What a tool needs and a game never asks: a game imports the store it wants.
 * @returns Every store the game has declared.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const listGameStores = (): TGameStore<Record<string, unknown>, unknown>[] => [...stores.values()];

/**
 * Forgets every store and every authored value waiting for one.
 *
 * For a test, and for a tool closing one project to open another: the stores of the old one must
 * not turn up in the new one's list.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const clearGameStores = (): void => {
    stores.clear();
    authored.clear();
    provisional.clear();
};

/**
 * Puts every store back to the start of a game: what its code declared, and then what its file
 * authored over the top.
 *
 * Both layers and in that order, which is the difference between "a new game" and "whatever the
 * code happened to hard-code". A store outlives a scene **and** a run, so without this a second
 * game carries on from where the first one left off.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const resetStores = (): void => {
    for (const store of stores.values()) {
        store.reset();
        applyAuthored(store);
    }
};
