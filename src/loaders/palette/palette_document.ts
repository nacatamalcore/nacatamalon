import type { TPaletteDoc } from './types/t_palette';

/**
 * The format number a palette written today carries.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const PALETTE_FORMAT = 1;

/**
 * As many colours as a palette may hold.
 *
 * Two hundred and fifty-six, which is more than any machine of the era ever showed at once, and the
 * ceiling exists because matching walks every colour for every pixel: a palette of ten thousand
 * would be a frame that never finishes rather than an error anybody could see.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const MAX_PALETTE_COLORS = 256;

const HEX = /^#[0-9a-f]{6}$/;

/**
 * `#rrggbb`, lower case, or nothing. Three-digit and eight-digit forms are not this format.
 */
const asHex = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const lowered = value.trim().toLowerCase();
    return HEX.test(lowered) ? lowered : null;
};

/**
 * Reads a `.palette`, whatever state it is in.
 *
 * Total and never throws, like every other document this engine reads: a palette is edited by hand
 * and written by tools, so one bad colour drops that colour and keeps the rest. A palette that ends
 * up with nothing in it is still a palette, and an effect matching against an empty one gives back
 * what it was handed, which is the honest answer to "reduce this to no colours".
 *
 * @param value Whatever `JSON.parse` gave back.
 * @returns The palette, always: whatever could not be read is left out, with a warning.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parsePaletteDoc = (value: unknown): TPaletteDoc => {
    const empty: TPaletteDoc = { format: PALETTE_FORMAT, kind: 'palette', name: '', colors: [] };
    if (typeof value !== 'object' || value === null) {
        return empty;
    }

    const read = value as Record<string, unknown>;
    const colors: string[] = [];
    if (Array.isArray(read.colors)) {
        for (const raw of read.colors) {
            const hex = asHex(raw);
            if (hex !== null && colors.length < MAX_PALETTE_COLORS) {
                colors.push(hex);
            }
        }
    }

    return {
        format: typeof read.format === 'number' ? read.format : PALETTE_FORMAT,
        kind: 'palette',
        name: typeof read.name === 'string' ? read.name : '',
        colors,
    };
};

/**
 * A palette with no colours yet: what a new `.palette` starts as.
 *
 * @param name - What to call it.
 * @returns The new palette, with no colours.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const emptyPaletteDoc = (name = 'Palette'): TPaletteDoc => ({
    format: PALETTE_FORMAT,
    kind: 'palette',
    name,
    colors: [],
});

/**
 * Writes a palette back out, for a tool that made or edited one.
 *
 * Two spaces and a line break at the end, the same bytes the files already on disk have, so saving
 * a palette nobody changed leaves nothing to review.
 *
 * @param doc - The palette to write.
 * @returns The file's text.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const serializePaletteDoc = (doc: TPaletteDoc): string => `${JSON.stringify({
    format: PALETTE_FORMAT,
    kind: 'palette',
    name: doc.name,
    colors: doc.colors.slice(0, MAX_PALETTE_COLORS),
}, null, 2)}\n`;

/**
 * Turns the colours into the one row of pixels the card reads.
 *
 * Opaque throughout: a palette says what colours exist, never how much of them to let through, and
 * an effect that matched against a half-transparent entry would dim the frame for a reason nobody
 * wrote down.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const packPaletteTexels = (colors: readonly string[]): Uint8Array => {
    const texels = new Uint8Array(Math.max(colors.length, 1) * 4);
    texels.fill(255);

    for (let i = 0; i < colors.length; i++) {
        const hex = colors[i]!;
        texels[i * 4] = parseInt(hex.slice(1, 3), 16);
        texels[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
        texels[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
        texels[i * 4 + 3] = 255;
    }

    return texels;
};
