import { readTables } from './read_tables';
import { readCmap } from './read_cmap';
import { readMetrics, readName } from './read_metrics';
import { readGlyf } from './read_glyf';
import { readKerning } from './read_kerning';
import type { TGlyphLookup } from './read_cmap';
import type { TKerning } from './read_kerning';
import type { TOutline } from './t_outline';

/**
 * A font file read and ready to be asked things: which glyph a character is, how wide it is, how it
 * is drawn and how it sits beside the next. Everything in the font's own units, y upwards.
 *
 * Not a record: it holds functions over the file's bytes, which is what keeps a large font cheap to
 * open. Kept beside the font record, never inside it.
 *
 * @internal
 */
export type TParsedFont = {
    name: string;
    unitsPerEm: number;
    ascender: number;
    descender: number;
    lineGap: number;
    glyphIndex: TGlyphLookup;
    advance: (glyph: number) => number;
    outline: (glyph: number) => TOutline;
    kerning: TKerning;
};

/**
 * Reads a font file: a `.ttf`, or a `.woff`.
 *
 * Throws with a message saying why for anything it cannot read, which the loader turns into a font
 * in `'error'` and a warning.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseFont = (bytes: Uint8Array): TParsedFont => {
    const tables = readTables(bytes);
    const metrics = readMetrics(tables);
    if (!tables.has('glyf') || !tables.has('loca')) {
        throw new Error('[NacatamalOn] useLoadFont: it has no \'glyf\' outlines to draw its letters with.');
    }
    return {
        name: readName(tables.get('name')),
        unitsPerEm: metrics.unitsPerEm,
        ascender: metrics.ascender,
        descender: metrics.descender,
        lineGap: metrics.lineGap,
        glyphIndex: readCmap(tables.get('cmap')),
        advance: metrics.advance,
        outline: readGlyf(tables.get('glyf'), tables.get('loca'), metrics.glyphCount, metrics.longOffsets),
        kerning: readKerning(tables.get('GPOS'), tables.get('kern')),
    };
};
