import { rootOf } from '../../box';
import { loadBitmapFont, newBitmapFont, trackLoad } from '../../loaders';
import { getActiveBox, getActiveGame } from '../../store';
import type { TBitmapFont } from '../../loaders';

/**
 * Where a bitmap font comes from.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadBitmapFontOptions = {
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
 *     const font = useLoadBitmapFont({
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
export const useLoadBitmapFont = ({ json, atlas, key }: TUseLoadBitmapFontOptions): TBitmapFont => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadBitmapFont: call it inside a scene body.');
    }

    const cacheKey = key ?? json;
    const { bitmapFonts } = store.get('assets');

    let font = bitmapFonts.get(cacheKey);
    if (font === undefined) {
        font = newBitmapFont(json, atlas, cacheKey);
        bitmapFonts.set(cacheKey, font);
        trackLoad(font, loadBitmapFont(store, font));
    }

    // Listed on the scene even when it came from the cache, so `useLoader()` counts it.
    const { loads } = rootOf(box);
    if (!loads.includes(font)) {
        loads.push(font);
    }

    return font;
};
