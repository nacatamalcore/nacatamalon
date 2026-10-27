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
     * How big the letters are, in pixels.
     *
     * For a vector font (`useLoadFont`), the size of the font as anywhere else type is set: one em is
     * this many pixels, and the line is as tall as the font says. Default 16. Any size is sharp.
     *
     * For a bitmap font, how tall one line is. Default: the font's own height, so the font as drawn. A pixel
     * font looks crisp at whole multiples of its height (16 or 24 for an 8 pixel font) and uneven in
     * between.
     */
    fontSize?: number;
    /**
     * Where each line sits: inside `maxWidth` when there is one, inside the width of the longest
     * line when not. Default `'left'`.
     */
    align?: 'left' | 'center' | 'right';
    /**
     * How wide a line can be, in pixels, before its words go on to the next one: a dialogue box, a
     * panel's description. The text's block is this wide, so `align` and `anchor` place the lines
     * in the box rather than around the words. Measured before the text's scale, like the other
     * sizes here.
     *
     * Lines break at spaces; a word wider than the whole width breaks between two letters. `\n`
     * still starts a line wherever it is. Changing the text or the size breaks it again on the next
     * frame. Left out or `0`, lines are only broken by `\n`.
     */
    maxWidth?: number;
    /**
     * Extra pixels between two characters. Default `0`.
     */
    letterSpacing?: number;
    /**
     * Extra pixels between two lines. Default `0`.
     */
    lineSpacing?: number;
};
