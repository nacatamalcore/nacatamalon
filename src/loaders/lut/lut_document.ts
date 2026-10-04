/**
 * The smallest table worth having: eight corners and nothing in between.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MIN_LUT_SIZE = 2;

/**
 * The largest. Sixty-four a side is a strip of four thousand and ninety-six pixels across, which is
 * already past what this era ever needed and near what a modest card will hold in one row.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAX_LUT_SIZE = 64;

/**
 * A table read out of a file and laid out the one way anything downstream understands.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLutDoc = {
    /**
     * Steps a side.
     */
    size: number;
    /**
     * `size * size` across by `size` down, four bytes a pixel.
     */
    data: Uint8Array;
};

const byte = (value: number): number => Math.min(255, Math.max(0, Math.round(value * 255)));

/**
 * The table that changes nothing: every colour maps to itself.
 *
 * What an effect grades against while its real table is still on its way, and why a missing file
 * costs you the grade rather than the picture.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const neutralLut = (size = 16): TLutDoc => {
    const clamped = Math.min(MAX_LUT_SIZE, Math.max(MIN_LUT_SIZE, Math.round(size)));
    const data = new Uint8Array(clamped * clamped * clamped * 4);
    const last = clamped - 1;

    for (let blue = 0; blue < clamped; blue++) {
        for (let green = 0; green < clamped; green++) {
            for (let red = 0; red < clamped; red++) {
                const at = ((green * clamped * clamped) + (blue * clamped) + red) * 4;
                data[at] = byte(red / last);
                data[at + 1] = byte(green / last);
                data[at + 2] = byte(blue / last);
                data[at + 3] = 255;
            }
        }
    }

    return { size: clamped, data };
};

/**
 * How many steps a side a strip image holds, or `0` if its shape is not one.
 *
 * A strip is `N` slices of `N` by `N` laid side by side, so it is always `N * N` across and `N`
 * down. Reading the size from the picture rather than from a field means a table cannot disagree
 * with the number it was labelled with.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const lutSizeForStrip = (width: number, height: number): number => {
    if (height < MIN_LUT_SIZE || height > MAX_LUT_SIZE || width !== height * height) {
        return 0;
    }
    return height;
};

/**
 * Reads a `.cube` into the strip layout.
 *
 * A `.cube` lists its entries with **red running fastest**, then green, then blue, which is not the
 * order a strip is laid out in, so every entry is placed rather than copied. Getting that wrong
 * gives a table that looks plausible and grades the wrong way round.
 *
 * Throws on a file that is not one, because unlike a palette there is no useful half of a broken
 * table: an entry list that stops early is a grade that is wrong everywhere past that point, which
 * would be far harder to notice than an error.
 *
 * @param source The file's text.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseCubeDoc = (source: string): TLutDoc => {
    let size = 0;
    const entries: number[][] = [];

    for (const raw of source.split('\n')) {
        const line = raw.trim();
        if (line === '' || line.startsWith('#')) {
            continue;
        }

        if (line.toUpperCase().startsWith('LUT_3D_SIZE')) {
            size = Number(line.slice('LUT_3D_SIZE'.length).trim());
            continue;
        }
        // TITLE, DOMAIN_MIN, DOMAIN_MAX and anything else a writer added: a line that does not begin
        // with a number is not an entry, and entries are all this needs.
        if (!/^[-\d.]/.test(line)) {
            continue;
        }

        const parts = line.split(/\s+/).map(Number);
        if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
            entries.push(parts);
        }
    }

    if (!Number.isFinite(size) || size < MIN_LUT_SIZE || size > MAX_LUT_SIZE) {
        throw new Error(`its LUT_3D_SIZE is ${size || 'missing'}, and it has to be between ${MIN_LUT_SIZE} and ${MAX_LUT_SIZE}`);
    }
    if (entries.length !== size * size * size) {
        throw new Error(`it says LUT_3D_SIZE ${size}, which needs ${size ** 3} entries, and it has ${entries.length}`);
    }

    const data = new Uint8Array(size * size * size * 4);
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        // Red fastest in the file; in the strip, red is x within a slice, green is y, blue is which
        // slice. So the row is green and the column is the slice plus the red step.
        const red = i % size;
        const green = Math.floor(i / size) % size;
        const blue = Math.floor(i / (size * size));
        const at = ((green * size * size) + (blue * size) + red) * 4;
        data[at] = byte(entry[0]!);
        data[at + 1] = byte(entry[1]!);
        data[at + 2] = byte(entry[2]!);
        data[at + 3] = 255;
    }

    return { size, data };
};
