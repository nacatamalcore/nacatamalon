import type { TFont, TFontGlyph } from './types/t_font';

/**
 * Each font's characters by character, built once the description arrives. Beside the font and not
 * inside it: a `Map` in the record would be the one field that does not survive being saved, and
 * the list it is built from is already there.
 */
const tables = new WeakMap<TFont, Map<string, TFontGlyph>>();

/**
 * Looks a character up in a font. `undefined` if the font has no such character or has not loaded.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fontGlyphs = (font: TFont): Map<string, TFontGlyph> => {
    let table = tables.get(font);
    if (table === undefined) {
        table = new Map((font.meta?.chars ?? []).map((glyph) => [glyph.char, glyph]));
        // Only kept once there is something to keep: an empty table built while loading would stay
        // empty for ever.
        if (font.meta !== null) {
            tables.set(font, table);
        }
    }
    return table;
};
