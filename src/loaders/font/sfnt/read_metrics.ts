const fail = (reason: string): never => {
    throw new Error(`[NacatamalOn] useLoadFont: ${reason}`);
};

/**
 * How a font is measured, in its own units: how many make the size of the font, how far above and
 * below the baseline its letters reach, and how much each glyph moves the pen on.
 *
 * @internal
 */
export type TFontMetrics = {
    unitsPerEm: number;
    /**
     * Above the baseline, positive.
     */
    ascender: number;
    /**
     * Below the baseline, negative, as fonts write it.
     */
    descender: number;
    lineGap: number;
    glyphCount: number;
    /**
     * Whether the outlines' positions are stored in two bytes or four, which `glyf` needs to be read.
     */
    longOffsets: boolean;
    /**
     * How far the glyph moves the pen.
     */
    advance: (glyph: number) => number;
};

/**
 * Reads a font's measurements from `head`, `hhea`, `maxp`, `hmtx` and `OS/2`.
 *
 * The line's height comes from `hhea`, which is what most systems use, unless the font says in
 * `OS/2` that its other set of numbers is the one to trust, which newer fonts do on purpose.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readMetrics = (tables: ReadonlyMap<string, DataView>): TFontMetrics => {
    const head = tables.get('head') ?? fail('it has no \'head\' table.');
    const hhea = tables.get('hhea') ?? fail('it has no \'hhea\' table.');
    const maxp = tables.get('maxp') ?? fail('it has no \'maxp\' table.');
    const hmtx = tables.get('hmtx') ?? fail('it has no \'hmtx\' table.');
    const os2 = tables.get('OS/2');

    const unitsPerEm = head.getUint16(18);
    if (unitsPerEm === 0) {
        fail('its size in units is zero.');
    }

    let ascender = hhea.getInt16(4);
    let descender = hhea.getInt16(6);
    let lineGap = hhea.getInt16(8);
    // Bit 7 of fsSelection: "use the typographic numbers". Only there from version 4 of the table on.
    if (os2 !== undefined && os2.byteLength >= 78 && (os2.getUint16(62) & 0x80) !== 0) {
        ascender = os2.getInt16(68);
        descender = os2.getInt16(70);
        lineGap = os2.getInt16(72);
    }

    const metricCount = hhea.getUint16(34);
    if (metricCount === 0 || metricCount * 4 > hmtx.byteLength) {
        fail('its \'hmtx\' table is shorter than it says.');
    }

    return {
        unitsPerEm,
        ascender,
        descender,
        lineGap,
        glyphCount: maxp.getUint16(4),
        longOffsets: head.getInt16(50) === 1,
        // Glyphs past the last full entry share its advance: a monospaced font stores it once.
        advance: (glyph) => hmtx.getUint16(Math.min(glyph, metricCount - 1) * 4),
    };
};

/**
 * The font's name as its family would be shown in a menu, or `''` when it has none that can be read.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readName = (view: DataView | undefined): string => {
    if (view === undefined || view.byteLength < 6) {
        return '';
    }
    const count = view.getUint16(2);
    const strings = view.getUint16(4);
    let found = '';
    for (let i = 0; i < count; i++) {
        const record = 6 + i * 12;
        if (record + 12 > view.byteLength) {
            break;
        }
        const platform = view.getUint16(record);
        const id = view.getUint16(record + 6);
        const length = view.getUint16(record + 8);
        const at = strings + view.getUint16(record + 10);
        // 4 is the full name ("Inter Bold"), 1 the family ("Inter"). The full one wins when both are there.
        if ((id !== 4 && id !== 1) || at + length > view.byteLength || (id === 1 && found !== '')) {
            continue;
        }
        let text = '';
        if (platform === 3 || platform === 0) {
            for (let c = 0; c + 1 < length; c += 2) text += String.fromCharCode(view.getUint16(at + c));
        } else if (platform === 1) {
            for (let c = 0; c < length; c++) text += String.fromCharCode(view.getUint8(at + c));
        } else {
            continue;
        }
        if (id === 4) {
            return text;
        }
        found = text;
    }
    return found;
};
