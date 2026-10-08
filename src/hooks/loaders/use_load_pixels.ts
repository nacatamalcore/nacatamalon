import { getActiveBox, getActiveGame } from '../../store';
import { loadPixels, newLoadedPixels } from '../../loaders/pixels';
import { rootOf } from '../../box';
import { trackLoad } from '../../loaders/track_load';
import type { TLoadedPixels } from '../../loaders/pixels';

/**
 * What `useLoadPixels` is asked for.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadPixelsOptions = {
    /**
     * Where the PNG is.
     */
    src: string;
    /**
     * What to keep it under, so another scene can reach the same one. Defaults to `src`.
     */
    key?: string;
};

/**
 * Loads a drawn picture as **pixels, to process it in code**: a palette swap, a white silhouette for
 * a hit, an outline, a collision mask taken from the drawing, a level read from an image.
 *
 * **To just show a drawn picture, use `useLoadTexture`**: that is the normal way, and faster, because
 * the picture goes straight to the graphics card. This is for when the game has to read or change
 * the drawing first. It reads PNG files, decoded in plain JavaScript with no canvas, so it works the
 * same in the browser and on the native runtime.
 *
 * It hands back a record at once, still loading, the way every loader does; `useLoader` counts it.
 * Give it straight to `createPixelTexture` with a function that changes it: the texture appears by
 * itself when the file arrives, and the function works on a copy. Once `status` is `'ready'`, its
 * `pixels` can be read as well (with `getPixel`) but not painted on: the picture is shared by every
 * scene that loads the same file.
 *
 * @param options - Where the file is, and the name to keep it under.
 * @returns The record. Its `status` says whether the picture has arrived, and `pixels` holds it.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     const hero = useLoadPixels({ src: '/assets/hero.png' });
 *     const gold = createPixelTexture(hero, (p) => swapColors(p, [[getColor('#3a7bff'), getColor('#ffd75a')]]));
 *     createSprite({ texture: gold, width: 32, height: 32 });
 *     return createScene();
 * };
 * ```
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadPixels = ({ src, key }: TUseLoadPixelsOptions): TLoadedPixels => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadPixels: call it inside a scene body.');
    }

    const cacheKey = key ?? src;
    const cache = store.get('assets').pixels;

    let record = cache.get(cacheKey);
    if (record === undefined) {
        record = newLoadedPixels(src, cacheKey);
        cache.set(cacheKey, record);
        trackLoad(record, loadPixels(store, record));
    }

    // Listed on the scene even when it came from the cache, so `useLoader()` counts it.
    const { loads } = rootOf(box);
    if (!loads.includes(record)) {
        loads.push(record);
    }
    return record;
};
