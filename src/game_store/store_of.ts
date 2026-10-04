import { getGameStore } from './store_registry';
import type { TGameObject } from '../hooks/spawn/use_spawn';
import type { TGameStore } from './types/t_game_store';

/**
 * The store an object was given: how a behaviour reaches state it did not define.
 *
 * This is what the link on an object is **for**. A behaviour attached through a tool cannot import
 * the file that declares a store, because it does not know where that file is, or even that it
 * exists; so the object names the store and the behaviour asks the object. It is also what makes
 * state reachable from a scene put together entirely by hand in an editor, where there is no code
 * to write an import in.
 *
 * Pass a `key` when the object was given more than one. With no key it hands back the only one it
 * has, and says so when there are several, because picking one of them would be a guess that works
 * until somebody adds the second.
 *
 * It is a plain function and not a hook on purpose: it registers nothing, cleans up nothing and is
 * told which object to look at, so it can be called anywhere, including from inside an update.
 *
 * Hands back `null` rather than a stand-in that does nothing, because the shape of a store is the
 * game's and there is no neutral state to invent. The warning says which of the two went wrong:
 * the object has no link at all, or it has one to a store this project does not have.
 *
 * @example
 * ```ts
 * declare let hungry: boolean;
 *
 * registerScript('feed', (self) => {
 *     const pet = storeOf<{ hunger: number }>(self);
 *     useUpdate(() => {
 *         if (pet !== null && hungry) pet.set((s) => { s.hunger += 10; });
 *     });
 * });
 * ```
 *
 * @param self The object, as a behaviour is handed it.
 * @param key Which of its stores, for an object that was given more than one.
 * @returns The store, or `null` when the object was given none, or it has not been declared.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const storeOf = <S extends object = Record<string, unknown>, A = Record<string, never>>(
    self: TGameObject,
    key?: string,
): TGameStore<S, A> | null => {
    const links = self.stores;
    if (links.length === 0) {
        console.warn(`[NacatamalOn] storeOf: '${self.name}' was not given any store, so there is nothing to hand back. Give it one in the editor, or with useStoreLink.`);
        return null;
    }

    let wanted = key;
    if (wanted === undefined) {
        if (links.length > 1) {
            console.warn(`[NacatamalOn] storeOf: '${self.name}' was given ${links.length} stores (${links.join(', ')}), so name the one you want. The first was used.`);
        }
        wanted = links[0];
    } else if (!links.includes(wanted)) {
        console.warn(`[NacatamalOn] storeOf: '${self.name}' was not given the store '${wanted}'. It has ${links.join(', ')}.`);
        return null;
    }

    const store = getGameStore(wanted);
    if (store === null) {
        console.warn(`[NacatamalOn] storeOf: '${self.name}' names the store '${wanted}', and this game has no store by that name. Nothing was handed back.`);
        return null;
    }
    return store as unknown as TGameStore<S, A>;
};
