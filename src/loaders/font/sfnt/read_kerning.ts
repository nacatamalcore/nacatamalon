/**
 * How much closer (negative) or further apart two glyphs sit when one follows the other, in the
 * font's units. `0` for a pair the font says nothing about.
 *
 * @internal
 */
export type TKerning = (left: number, right: number) => number;

const NONE: TKerning = () => 0;

/**
 * Where a glyph is in a list of glyphs (a "coverage"), or `-1` when it is not in it.
 */
const coverageIndex = (view: DataView, at: number, glyph: number): number => {
    const format = view.getUint16(at);
    const count = view.getUint16(at + 2);
    let low = 0;
    let high = count - 1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (format === 1) {
            const value = view.getUint16(at + 4 + middle * 2);
            if (glyph < value) high = middle - 1;
            else if (glyph > value) low = middle + 1;
            else return middle;
        } else if (format === 2) {
            const range = at + 4 + middle * 6;
            if (glyph < view.getUint16(range)) high = middle - 1;
            else if (glyph > view.getUint16(range + 2)) low = middle + 1;
            else return view.getUint16(range + 4) + glyph - view.getUint16(range);
        } else {
            return -1;
        }
    }
    return -1;
};

/**
 * Which group a glyph belongs to in a "class definition". Glyphs left out are in group `0`.
 */
const classOf = (view: DataView, at: number, glyph: number): number => {
    const format = view.getUint16(at);
    if (format === 1) {
        const first = view.getUint16(at + 2);
        const count = view.getUint16(at + 4);
        return glyph >= first && glyph < first + count ? view.getUint16(at + 6 + (glyph - first) * 2) : 0;
    }
    if (format === 2) {
        let low = 0;
        let high = view.getUint16(at + 2) - 1;
        while (low <= high) {
            const middle = (low + high) >> 1;
            const range = at + 4 + middle * 6;
            if (glyph < view.getUint16(range)) high = middle - 1;
            else if (glyph > view.getUint16(range + 2)) low = middle + 1;
            else return view.getUint16(range + 4);
        }
    }
    return 0;
};

/**
 * How many bytes a value record of this shape takes: two for every bit set in its format.
 */
const valueSize = (format: number): number => {
    let size = 0;
    for (let bit = format & 0xff; bit !== 0; bit >>= 1) size += (bit & 1) * 2;
    return size;
};

/**
 * The horizontal advance change in a value record: the field for bit 2, after the fields before it.
 */
const xAdvance = (view: DataView, at: number, format: number): number => {
    if ((format & 4) === 0) {
        return 0;
    }
    const before = valueSize(format & 3);
    return view.getInt16(at + before);
};

/**
 * One pair-adjustment subtable: either a list of second glyphs per first glyph, or a grid of groups.
 * `undefined` when the first glyph is not one this subtable speaks for, so the next one is asked.
 */
const pairAdjustment = (view: DataView, at: number, left: number, right: number): number | undefined => {
    const format = view.getUint16(at);
    const index = coverageIndex(view, at + view.getUint16(at + 2), left);
    if (index < 0) {
        return undefined;
    }
    const first = view.getUint16(at + 4);
    const second = view.getUint16(at + 6);
    const recordSize = 2 + valueSize(first) + valueSize(second);

    if (format === 1) {
        if (index >= view.getUint16(at + 8)) {
            return undefined;
        }
        const set = at + view.getUint16(at + 10 + index * 2);
        let low = 0;
        let high = view.getUint16(set) - 1;
        while (low <= high) {
            const middle = (low + high) >> 1;
            const record = set + 2 + middle * recordSize;
            const glyph = view.getUint16(record);
            if (right < glyph) high = middle - 1;
            else if (right > glyph) low = middle + 1;
            else return xAdvance(view, record + 2, first);
        }
        return undefined;
    }
    if (format === 2) {
        const leftClass = classOf(view, at + view.getUint16(at + 8), left);
        const rightClass = classOf(view, at + view.getUint16(at + 10), right);
        const classes1 = view.getUint16(at + 12);
        const classes2 = view.getUint16(at + 14);
        if (leftClass >= classes1 || rightClass >= classes2) {
            return undefined;
        }
        const record = at + 16 + (leftClass * classes2 + rightClass) * (valueSize(first) + valueSize(second));
        return xAdvance(view, record, first);
    }
    return undefined;
};

/**
 * The pair-adjustment subtables of every lookup the font's `kern` features use, in lookup order.
 */
const kernSubtables = (gpos: DataView): number[] => {
    const features = gpos.getUint16(6);
    const lookups = gpos.getUint16(8);
    const used = new Set<number>();
    const featureCount = gpos.getUint16(features);
    for (let i = 0; i < featureCount; i++) {
        const record = features + 2 + i * 6;
        const tag = String.fromCharCode(gpos.getUint8(record), gpos.getUint8(record + 1), gpos.getUint8(record + 2), gpos.getUint8(record + 3));
        if (tag !== 'kern') {
            continue;
        }
        const feature = features + gpos.getUint16(record + 4);
        const count = gpos.getUint16(feature + 2);
        for (let k = 0; k < count; k++) used.add(gpos.getUint16(feature + 4 + k * 2));
    }

    const subtables: number[] = [];
    for (const index of [...used].sort((a, b) => a - b)) {
        const lookup = lookups + gpos.getUint16(lookups + 2 + index * 2);
        const type = gpos.getUint16(lookup);
        const count = gpos.getUint16(lookup + 4);
        for (let s = 0; s < count; s++) {
            const subtable = lookup + gpos.getUint16(lookup + 6 + s * 2);
            if (type === 2) {
                subtables.push(subtable);
            } else if (type === 9 && gpos.getUint16(subtable + 2) === 2) {
                // An extension: the same subtable, kept further away so offsets fit in two bytes.
                subtables.push(subtable + gpos.getUint32(subtable + 4));
            }
        }
    }
    return subtables;
};

/**
 * The older kerning table: one sorted list of glyph pairs and how much to move each.
 */
const kernTable = (kern: DataView): TKerning => {
    if (kern.getUint16(0) !== 0) {
        return NONE;
    }
    const tables = kern.getUint16(2);
    let at = 4;
    for (let i = 0; i < tables; i++) {
        const length = kern.getUint16(at + 2);
        const coverage = kern.getUint16(at + 4);
        // Format 0 (the high byte), horizontal (bit 0), not across the line (bit 2).
        if ((coverage >> 8) === 0 && (coverage & 1) !== 0 && (coverage & 4) === 0) {
            const pairs = kern.getUint16(at + 6);
            const first = at + 14;
            return (left, right) => {
                const key = left * 65536 + right;
                let low = 0;
                let high = pairs - 1;
                while (low <= high) {
                    const middle = (low + high) >> 1;
                    const record = first + middle * 6;
                    const value = kern.getUint16(record) * 65536 + kern.getUint16(record + 2);
                    if (key < value) high = middle - 1;
                    else if (key > value) low = middle + 1;
                    else return kern.getInt16(record + 4);
                }
                return 0;
            };
        }
        at += length;
    }
    return NONE;
};

/**
 * Reads how a font spaces pairs of glyphs.
 *
 * Newer fonts keep it in `GPOS`, under their `kern` feature; older ones in a table of their own,
 * `kern`. The newer one wins when both are there, because a font that has both was made for the
 * newer one and keeps the old table only for old software. A font with neither spaces every pair by
 * the glyphs' own advances.
 *
 * Answers are remembered: a text asks about the same few pairs every frame.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readKerning = (gpos: DataView | undefined, kern: DataView | undefined): TKerning => {
    let read: TKerning = NONE;
    try {
        const subtables = gpos !== undefined && gpos.getUint16(0) === 1 ? kernSubtables(gpos) : [];
        if (subtables.length > 0) {
            read = (left, right) => {
                for (const subtable of subtables) {
                    const value = pairAdjustment(gpos!, subtable, left, right);
                    if (value !== undefined) {
                        return value;
                    }
                }
                return 0;
            };
        } else if (kern !== undefined) {
            read = kernTable(kern);
        }
    } catch {
        return NONE;
    }

    const known = new Map<number, number>();
    return (left, right) => {
        const key = left * 65536 + right;
        let value = known.get(key);
        if (value === undefined) {
            try {
                value = read(left, right);
            } catch {
                value = 0;
            }
            known.set(key, value);
        }
        return value;
    };
};
