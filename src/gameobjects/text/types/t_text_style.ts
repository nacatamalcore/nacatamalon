/**
 * How a text is set: size, alignment and spacing. Kept apart from the rest of a text so it can be
 * shared: several texts given the same style change together when it changes.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTextStyle = {
    /**
     * How tall one line is, in pixels. Default: the font's own height, so the font as drawn. A pixel
     * font looks crisp at whole multiples of its height (16 or 24 for an 8 pixel font) and uneven in
     * between.
     */
    fontSize?: number;
    /**
     * Where each line sits inside the width of the longest one. Default `'left'`.
     */
    align?: 'left' | 'center' | 'right';
    /**
     * Extra pixels between two characters. Default `0`.
     */
    letterSpacing?: number;
    /**
     * Extra pixels between two lines. Default `0`.
     */
    lineSpacing?: number;
};
