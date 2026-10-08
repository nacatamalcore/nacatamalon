import { bumpVersion } from '../../store/record_version';
import { parseFont } from './sfnt/parse_font';
import { attachFont, fontGlyph, uploadFontAtlas } from './font_glyphs';
import type { TRuntimeStore } from '../../store';
import type { TFont } from './types/t_font';

/**
 * Fetches a vector font, reads it and gets its atlas ready, drawing `chars` into it straight away so a
 * text that shows them later does not have to.
 *
 * Never rejects. A missing file, or one in a kind this engine does not read, ends as `'error'` with a
 * warning that says which, and texts using the font simply draw nothing: one bad font must not take
 * the scene down.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadFont = async (store: TRuntimeStore, font: TFont, chars = ''): Promise<void> => {
    try {
        const response = await fetch(font.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const parsed = parseFont(new Uint8Array(await response.arrayBuffer()));
        if (store.get('loop').destroyed) {
            return;
        }

        font.meta = {
            name: parsed.name,
            unitsPerEm: parsed.unitsPerEm,
            ascender: parsed.ascender,
            descender: parsed.descender,
            lineGap: parsed.lineGap,
            atlasWidth: 0,
            atlasHeight: 0,
        };
        attachFont(font, parsed, store);
        for (const char of chars) {
            fontGlyph(font, char);
        }
        uploadFontAtlas(font);
        font.status = 'ready';
        bumpVersion(font);
    } catch (error: unknown) {
        font.status = 'error';
        font.texture.status = 'error';
        bumpVersion(font);
        console.warn(`[NacatamalOn] useLoadFont: '${font.src}' could not be loaded. Texts using it draw nothing.`, error);
    }
};
