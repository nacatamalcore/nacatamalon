import { bumpVersion } from '../../store/record_version';
import { loadTexture } from '../texture/load_texture';
import type { TRuntimeStore } from '../../store';
import type { TFont, TFontMeta } from './types/t_font';

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
export const loadFont = async (store: TRuntimeStore, font: TFont): Promise<void> => {
    try {
        const [meta] = await Promise.all([
            fetch(font.src).then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json() as Promise<TFontMeta>;
            }),
            loadTexture(store, font.texture),
        ]);

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
        font.status = 'error';
        bumpVersion(font);
        console.warn(`[NacatamalOn] useLoadFont: '${font.src}' could not be loaded. Texts using it draw nothing.`, error);
    }
};
