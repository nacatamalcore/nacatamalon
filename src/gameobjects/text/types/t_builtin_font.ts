/**
 * One of the fonts built into the engine, as `scripts/build_fonts.ts` writes it: its image is a grid
 * of 8 x 8 cells, sixteen to a row, holding `chars` in order, so where each one is can be worked out
 * rather than written down.
 */
export type TBuiltinFont = {
    name: string;
    /**
     * The reserved key a text names it by, `nacatamalon:<name>`.
     */
    key: string;
    tracking: number;
    baseline: number;
    chars: string;
    /**
     * Each character's width in pixels, one digit per character, in the order of `chars`.
     */
    widths: string;
    /**
     * The image, as a `data:` address.
     */
    atlas: string;
};
