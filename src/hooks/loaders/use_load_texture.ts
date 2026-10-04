import { rootOf } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { loadTexture, newTexture, trackLoad } from '../../loaders';
import type { TTexture } from '../../loaders';

/**
 * What `useLoadTexture` is asked for. Named fields rather than two positional strings, which would
 * be too easy to swap.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadTextureOptions = {
    /**
     * Where the image is.
     */
    src: string;
    /**
     * What to cache it under, so another scene can reach it with `createSprite({ key })`. Defaults to `src`.
     */
    key?: string;
};

/**
 * Loads an image to draw with, and hands it back at once, still loading: a sprite made with it
 * appears by itself when the file arrives, so nothing has to wait for it.
 * 
 * You can use this hook with a `useLoader` to track its loading progress.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const hero = useLoadTexture({ src: '/assets/hero.png', key: 'hero' });
 *     createSprite({ texture: hero });
 *     return createScene();
 * };
 * ```
 *
 * @param options - Where the image is, and the name to keep it under (`key`), which a later
 * `createSprite({ key })` can find it by.
 * @returns The texture. Its `status` says whether it has arrived.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadTexture = ({ src, key }: TUseLoadTextureOptions): TTexture => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadTexture: call it inside a scene body.');
    }

    const cacheKey = key ?? src;
    const { textures } = store.get('assets');

    let texture = textures.get(cacheKey);
    if (texture === undefined) {
        texture = newTexture(src, cacheKey);
        textures.set(cacheKey, texture);
        trackLoad(texture, loadTexture(store, texture));
    }

    // Listed on the scene even when it came from the cache: `useLoader()` counts everything the
    // scene asked for, and a cached texture counts as already loaded.
    const { loads } = rootOf(box);
    if (!loads.includes(texture)) {
        loads.push(texture);
    }

    return texture;
};
