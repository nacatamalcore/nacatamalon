import { bumpVersion } from '../../store/record_version';
import { uploadTexture } from '../texture/upload_texture';
import { keepBitmapFontPixels } from './bitmap_font_pixels';
import type { TRuntimeStore } from '../../store';
import type { TBitmapFont, TBitmapFontMeta } from './types/t_bitmap_font';

/**
 * Fetches a font's description and its image, filling the font in place. `'ready'` only when both
 * have arrived: a text needs where each character is and the picture to cut it from.
 *
 * Never rejects. A missing file or a broken image ends as `'error'` with a warning, and texts using
 * the font simply draw nothing: one bad font must not take the scene down.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadBitmapFont = async (store: TRuntimeStore, font: TBitmapFont): Promise<void> => {
    try {
        const [meta, image] = await Promise.all([
            fetch(font.src).then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json() as Promise<TBitmapFontMeta>;
            }),
            fetch(font.texture.src).then((response) => {
                if (!response.ok) {
                    throw new Error(`its image '${font.texture.src}' could not be loaded: HTTP ${response.status}`);
                }
                return response.blob();
            }),
        ]);
        // Downloaded once and used twice: on the card for texts, and in memory for `drawText`.
        await Promise.all([uploadTexture(store, font.texture, image), keepBitmapFontPixels(font, image)]);

        if (font.texture.status !== 'ready') {
            throw new Error(`its image '${font.texture.src}' could not be loaded`);
        }
        if (!Array.isArray(meta.chars) || !(meta.glyphHeight > 0)) {
            throw new Error('the description has no characters or no glyphHeight');
        }

        font.meta = meta;
        font.status = 'ready';
        bumpVersion(font);
    } catch (error: unknown) {
        if (font.texture.status !== 'ready') {
            font.texture.status = 'error';
            bumpVersion(font.texture);
        }
        font.status = 'error';
        bumpVersion(font);
        console.warn(`[NacatamalOn] useLoadBitmapFont: '${font.src}' could not be loaded. Texts using it draw nothing.`, error);
    }
};
