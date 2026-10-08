/**
 * From a character's code point to the number of its glyph in the font. `0` when the font has no
 * such character, which is the font's own "missing" glyph.
 *
 * @internal
 */
export type TGlyphLookup = (codePoint: number) => number;

const NONE: TGlyphLookup = () => 0;

/**
 * The format that covers every Unicode character: a list of runs, each one a range of characters
 * whose glyphs are numbered one after the other.
 */
const segmentedCoverage = (view: DataView, at: number): TGlyphLookup => {
    const groups = view.getUint32(at + 12);
    return (codePoint) => {
        let low = 0;
        let high = groups - 1;
        while (low <= high) {
            const middle = (low + high) >> 1;
            const group = at + 16 + middle * 12;
            if (codePoint < view.getUint32(group)) {
                high = middle - 1;
            } else if (codePoint > view.getUint32(group + 4)) {
                low = middle + 1;
            } else {
                return view.getUint32(group + 8) + codePoint - view.getUint32(group);
            }
        }
        return 0;
    };
};

/**
 * The format almost every font carries, for the characters below 65536: ranges of characters, each
 * mapped either by adding a number to the code or through a table that follows.
 */
const segmentMapping = (view: DataView, at: number): TGlyphLookup => {
    const segments = view.getUint16(at + 6) / 2;
    const ends = at + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    return (codePoint) => {
        if (codePoint > 0xffff) {
            return 0;
        }
        let low = 0;
        let high = segments - 1;
        while (low <= high) {
            const middle = (low + high) >> 1;
            if (codePoint > view.getUint16(ends + middle * 2)) {
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        // `low` is now the first range that ends at or after the character.
        if (low >= segments) {
            return 0;
        }
        const start = view.getUint16(starts + low * 2);
        if (codePoint < start) {
            return 0;
        }
        const delta = view.getUint16(deltas + low * 2);
        const rangeAt = ranges + low * 2;
        const offset = view.getUint16(rangeAt);
        if (offset === 0) {
            return (codePoint + delta) & 0xffff;
        }
        // The offset counts from where it is itself stored, which is how the format was written.
        const glyphAt = rangeAt + offset + (codePoint - start) * 2;
        if (glyphAt + 2 > view.byteLength) {
            return 0;
        }
        const glyph = view.getUint16(glyphAt);
        return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    };
};

/**
 * Reads which glyph draws each character.
 *
 * A font can carry several of these tables, for different systems. The one that covers every Unicode
 * character is taken when it is there, and the common one for the rest otherwise. A font with
 * neither maps nothing: every character comes out as the missing glyph rather than as an error.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readCmap = (view: DataView | undefined): TGlyphLookup => {
    if (view === undefined) {
        return NONE;
    }
    const count = view.getUint16(2);
    let full: number | undefined;
    let basic: number | undefined;
    for (let i = 0; i < count; i++) {
        const record = 4 + i * 8;
        const platform = view.getUint16(record);
        const encoding = view.getUint16(record + 2);
        const at = view.getUint32(record + 4);
        // Unicode (platform 0) or Windows Unicode (platform 3, encodings 1 and 10).
        const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
        if (!unicode || at + 4 > view.byteLength) {
            continue;
        }
        const format = view.getUint16(at);
        if (format === 12 && full === undefined) {
            full = at;
        } else if (format === 4 && basic === undefined) {
            basic = at;
        }
    }
    if (full !== undefined) {
        return segmentedCoverage(view, full);
    }
    if (basic !== undefined) {
        return segmentMapping(view, basic);
    }
    return NONE;
};
