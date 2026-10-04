import { getActiveBox } from '../../store';
import type { TGameStore, TStoreListener, TStoreSelector } from '../../game_store';

/**
 * Reacts from a scene when one value of a store changes, and stops by itself when that part of the
 * scene goes away. Nothing to disconnect by hand.
 *
 * The selector picks the value; the handler runs only when it changes, straight away, inside the change
 * that caused it, with the new value and the one before. A value that decays every frame but is
 * selected as "is it low?" only calls the handler when the answer flips.
 *
 * Pick values, not objects: the store's state is changed in place, so `(s) => s.inventory` is the
 * same object every time and never looks changed. `(s) => s.inventory.length` does.
 *
 * The handler is not called when the scene starts: the scene can read `store.state` right there. It
 * keeps listening while the scene is paused, like `useSignal`.
 *
 * @param store The store, made with `createGameStore`.
 * @param selector Picks the value to watch.
 * @param handler What to do when it changes.
 * @param equals When two values count as the same. Default `Object.is`.
 *
 * @example
 * ```ts
 * declare const petStore: TGameStore<{ hunger: number }>;
 * const GREEN = getColor('#40c040');
 * const RED = getColor('#e04040');
 *
 * export const Pet: TSceneFn = () => {
 *     const pet = createSprite({ tint: GREEN, width: 64, height: 64 });
 *     useStore(petStore, (s) => s.hunger > 30, (content) => {
 *         pet.tint = content ? GREEN : RED;
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useStore = <S extends object, A, T>(
    store: TGameStore<S, A>,
    selector: TStoreSelector<S, T>,
    handler: TStoreListener<T>,
    equals?: (a: T, b: T) => boolean,
): void => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useStore: call it inside a scene body, not from a timer or a callback.');
    }

    const off = store.subscribe(selector, (value, previous) => {
        // Destroyed this frame and not swept yet: it stops hearing now, the same way it stops updating.
        if (box.destroyed) {
            return;
        }
        handler(value, previous);
    }, equals);
    box.cleanups.push(off);
};
