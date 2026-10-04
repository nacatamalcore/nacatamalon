import { rootOf } from '../../box';
import { loadFont, newFont, trackLoad } from '../../loaders';
import { getActiveBox, getActiveGame } from '../../store';
import type { TFont } from '../../loaders';

/**
 * Where a bitmap font comes from.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadFontOptions = {
    /**
     * The font's description file: where each character sits in the image.
     */
    json: string;
    /**
     * The image with every character drawn in it.
     */
    atlas: string;
    /**
     * What to call it in this game. Default: the description's path.
     */
    key?: string;
};

/**
 * Loads a bitmap font: an image with the characters drawn in it, and a file saying where each one is.
 *
 * You get the font back at once, still loading. Hand it to `createText` straight away: the text
 * appears by itself when the font arrives, and `useLoader` counts it like any other asset.
 *
 * Asking for the same font twice, in this scene or another, gives back the one already loaded.
 *
 * @param options `json` and `atlas`, the two files of the font, and an optional `key`.
 * @returns The font.
 *
 * @example
 * ```ts
 * export const Title: TSceneFn = () => {
 *     const font = useLoadFont({
 *         json: '/fonts/arcade/arcade.json',
 *         atlas: '/fonts/arcade/arcade.png',
 *     });
 *
 *     createText({ text: 'PRESS START', font, transform: { x: 16, y: 16 } });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadFont = ({ json, atlas, key }: TUseLoadFontOptions): TFont => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadFont: call it inside a scene body.');
    }

    const cacheKey = key ?? json;
    const { fonts } = store.get('assets');

    let font = fonts.get(cacheKey);
    if (font === undefined) {
        font = newFont(json, atlas, cacheKey);
        fonts.set(cacheKey, font);
        trackLoad(font, loadFont(store, font));
    }

    // Listed on the scene even when it came from the cache, so `useLoader()` counts it.
    const { loads } = rootOf(box);
    if (!loads.includes(font)) {
        loads.push(font);
    }

    return font;
};
