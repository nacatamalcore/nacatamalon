import { getActiveBox } from '../../store';

/**
 * Says that this object **uses** one of the game's stores.
 *
 * The important word is *uses*. The store is not in the object and cannot be: it outlives every
 * scene, and one living inside an object would die with its scene and be two the moment a second
 * object named it. So what is kept here is the name, exactly as a behaviour is kept by name rather
 * than as a function.
 *
 * Two things come of it that an ordinary import cannot give. A behaviour attached in an editor can
 * be handed the state through the scene itself (`storeOf(self)`), so a scene put together entirely
 * by hand can wire behaviour to state with no file to write. And the tree becomes able to answer
 * "what touches this state?", which nothing else could.
 *
 * Called by the scene reader for a store component; call it yourself when you would rather say it
 * in code than in the document.
 *
 * @example
 * ```ts
 * const Pet = () => {
 *     useStoreLink('pet');
 *     // ...and now a behaviour on this object can reach it with storeOf(self).
 * };
 * ```
 *
 * @param key - The store's name, as `createGameStore` was given it.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useStoreLink = (key: string): void => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useStoreLink: call it inside a scene body.');
    }
    // Once: naming the same store twice is one link, and a list with it twice would make
    // "how many stores does this use" answer wrong.
    if (!box.stores.includes(key)) {
        box.stores.push(key);
    }
};
