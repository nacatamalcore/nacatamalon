import { rootOf } from '../../box';
import { loadAtlas, newAtlas, trackLoad } from '../../loaders';
import type { TLoadedAtlas } from '../../loaders';
import { getActiveBox, getActiveGame } from '../../store';

/**
 * What `useLoadAtlas` is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadAtlasOptions = {
    /**
     * Where the `.atlas` file is.
     */
    src: string;
    /**
     * What to remember it under, so another scene can ask for the same sheet. Defaults to `src`.
     */
    key?: string;
};

/**
 * Loads a sheet written as a file: the image, how it is cut into frames, and the named runs of
 * frames over it.
 *
 * The file-based twin of `createSpriteAtlas`. Slicing in code is fine while a sheet is used in
 * one place; a file is what lets the same slicing be **shared** by everything that reads the
 * sheet, and changed without touching any code, which is what an editor and an artist need.
 *
 * Asking twice for the same sheet gives the same one back, already loaded, so scenes can help
 * themselves without arranging anything between them.
 *
 * What comes back can be used right away: sprites made from it show their frame when it arrives,
 * and `useLoader` counts it like an image.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const coin = useLoadAtlas({ src: '/assets/atlases/coin.atlas' });
 *
 *     const sprite = createSprite({ atlas: coin, transform: { x: 160, y: 120 } });
 *     // The runs come from the file, so the clip is not written twice.
 *     useSpriteAnimation(sprite, { clips: coin.sequences, play: 'spin' });
 *
 *     return createScene();
 * };
 * ```
 *
 * @param options - Where the `.atlas` file is, and the name to keep it under.
 * @returns The sheet, still loading: its `status` says when it has arrived.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadAtlas = ({ src, key }: TUseLoadAtlasOptions): TLoadedAtlas => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadAtlas: call it inside a scene body.');
    }

    const cacheKey = key ?? src;
    const { atlases } = store.get('assets');

    let atlas = atlases.get(cacheKey);
    if (atlas === undefined) {
        atlas = newAtlas(src, cacheKey);
        atlases.set(cacheKey, atlas);
        trackLoad(atlas, loadAtlas(store, atlas));
    }

    // Listed on the scene even when it came from the cache, so `useLoader()` counts everything
    // the scene asked for and a cached sheet counts as already loaded.
    const { loads } = rootOf(box);
    if (!loads.includes(atlas)) {
        loads.push(atlas);
    }

    return atlas;
};
