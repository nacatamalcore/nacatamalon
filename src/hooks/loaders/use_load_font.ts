import { rootOf } from '../../box';
import { DEFAULT_FONT_ATLAS_SIZE, loadFont, newFont, trackLoad } from '../../loaders';
import { getActiveBox, getActiveGame } from '../../store';
import type { TFont } from '../../loaders';

/**
 * Where a vector font comes from, and how finely its letters are kept.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadFontOptions = {
    /**
     * The font file: a `.ttf` or a `.woff`.
     */
    src: string;
    /**
     * What to call it in this game. Default: `src`.
     */
    key?: string;
    /**
     * How many pixels tall one em of a letter is kept, from 16 to 128. Default `48`, enough for most
     * fonts at any size. Raise it for a font with very thin strokes or fine detail; it does not change
     * how big a text is on screen.
     */
    size?: number;
    /**
     * Characters to get ready while the font loads, instead of the first time a text shows them.
     * Worth it for a long text that appears all at once in the middle of play.
     */
    chars?: string;
};

/**
 * Loads a vector font: a `.ttf` or `.woff` file, the kind a computer has installed.
 *
 * You get the font back at once, still loading. Hand it to `createText` straight away: the text
 * appears by itself when the font arrives, and `useLoader` counts it like any other asset.
 *
 * Unlike a bitmap font (`useLoadBitmapFont`), it looks sharp at any `fontSize`, and when the text is
 * scaled, turned or seen through a zoomed camera: each letter is kept as a distance field, drawn the
 * first time it is needed, and the edge is worked out again at whatever size it ends up on screen.
 * Accents, ñ and every other character the font has work with no list of characters to keep in sync.
 *
 * Reads TrueType outlines (most `.ttf`, and `.woff` files made from them), with the font's own
 * kerning. Not yet: `.otf` files with cubic outlines, `.woff2`, and scripts whose letters change shape
 * by their neighbours (Arabic, the Indic scripts). Such a font ends as `'error'` with a warning saying
 * which.
 *
 * Asking for the same font twice, in this scene or another, gives back the one already loaded.
 *
 * @param options `src`, the font file, and optionally `key`, `size` and `chars`.
 * @returns The font.
 *
 * @example
 * ```ts
 * export const Title: TSceneFn = () => {
 *     const font = useLoadFont({ src: '/fonts/Inter.ttf' });
 *
 *     createText({ text: '¡Hola, ñandú!', font, style: { fontSize: 32 }, transform: { x: 16, y: 16 } });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadFont = ({ src, key, size, chars }: TUseLoadFontOptions): TFont => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadFont: call it inside a scene body.');
    }

    const cacheKey = key ?? src;
    const { fonts } = store.get('assets');

    let font = fonts.get(cacheKey);
    if (font === undefined) {
        const kept = Math.round(Math.min(128, Math.max(16, size ?? DEFAULT_FONT_ATLAS_SIZE)));
        font = newFont(src, cacheKey, kept);
        fonts.set(cacheKey, font);
        trackLoad(font, loadFont(store, font, chars));
    }

    // Listed on the scene even when it came from the cache, so `useLoader()` counts it.
    const { loads } = rootOf(box);
    if (!loads.includes(font)) {
        loads.push(font);
    }

    return font;
};
