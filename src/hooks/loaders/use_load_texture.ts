import { GAME, hold } from '../../loaders/asset_holds';
import { warnIfKeyTaken } from '../../loaders/key_taken';
import { rootOf } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { loadTexture, newTexture, trackLoad } from '../../loaders';
import type { TTexture } from '../../loaders';
import { assetKey } from '../../loaders/asset_key';
import { isMipmapped, markMipmapped } from '../../loaders/texture/mipmapped_texture';
import { outsideSceneBody } from '../../utils/outside_scene_body';

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
     * The name the game finds it by, here or in another scene: `createSprite({ texture: 'hero' })`.
     * Defaults to `src` as the page resolves it, so one file written two ways (on a page at the
     * root, `./assets/a.png` and `/assets/a.png`) is kept once and found by either. One key names
     * one file: another file asked for under a key already taken is not loaded, the first is handed
     * back, and it is said.
     */
    key?: string;
    /**
     * Also make its mipmaps: smaller and smaller copies of it, each half the one before, so a
     * model's surface far away or seen edge on reads the copy its size on the screen asks for and
     * does not shimmer or crawl. For a model's picture or a material's map, a floor or a wall that
     * runs into the distance. Sprites, map layers and particles never read them, so they are not
     * worth it there. They cost a third more memory on the graphics card. Default `false`.
     *
     * Each texture is made once, by whoever asks for its key first: asked for again the other way,
     * it is handed back as it was made, and it is said.
     */
    mipmaps?: boolean;
};

/**
 * The textures already said to be asked for the other way about their mipmaps: once each, not once
 * for every object that asks.
 */
const warnedMipmaps = new WeakSet<TTexture>();

/**
 * Loads an image to draw with, and hands it back at once, still loading: a sprite made with it
 * appears by itself when the file arrives, so nothing has to wait for it.
 * 
 * You can use this hook with a `useLoadProgress` to track its loading progress.
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
 * `createSprite({ texture: 'hero' })` can find it by.
 * @returns The texture. Its `status` says whether it has arrived.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadTexture = ({ src, key, mipmaps = false }: TUseLoadTextureOptions): TTexture => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw outsideSceneBody('useLoadTexture');
    }

    const cacheKey = key ?? assetKey(src);
    const { textures } = store.get('assets');

    let texture = textures.get(cacheKey);
    if (texture !== undefined) {
        warnIfKeyTaken('useLoadTexture', cacheKey, texture.src, src);
        if (isMipmapped(texture) !== mipmaps && !warnedMipmaps.has(texture)) {
            warnedMipmaps.add(texture);
            console.warn(`[NacatamalOn] useLoadTexture: '${cacheKey}' was already loaded ${mipmaps ? 'without' : 'with'} mipmaps, and is handed back as it is. Load it under another key to have it both ways.`);
        }
    }
    if (texture === undefined) {
        texture = newTexture(src, cacheKey);
        if (mipmaps) {
            markMipmapped(texture);
        }
        textures.set(cacheKey, texture);
        trackLoad(texture, loadTexture(store, texture));
    }

    // Asked for by the game, which a file naming the same one does not undo: letting go of the file
    // leaves it.
    hold(texture, GAME);

    // Listed on the scene even when it came from the cache: `useLoadProgress()` counts everything the
    // scene asked for, and a cached texture counts as already loaded.
    const { loads } = rootOf(box);
    if (!loads.includes(texture)) {
        loads.push(texture);
    }

    return texture;
};
