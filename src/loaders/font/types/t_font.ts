import type { TLoadStatus } from '../../types/t_load_status';
import type { TTexture } from '../../texture/types/t_texture';

/**
 * What a vector font says about itself once it has been read, in its own units unless said otherwise.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFontMeta = {
    /**
     * Its name as the file gives it ("Inter Bold"), or `''` when the file has none.
     */
    name: string;
    /**
     * How many of its units make the size of the font. A `fontSize` of 16 makes this many units 16 pixels.
     */
    unitsPerEm: number;
    /**
     * How far above the baseline its tallest letters reach.
     */
    ascender: number;
    /**
     * How far below the baseline its letters reach. Negative, as fonts write it.
     */
    descender: number;
    /**
     * Extra space the font asks for between two lines.
     */
    lineGap: number;
    /**
     * The size of the image its letters are kept in, in pixels. It grows as new characters are drawn.
     */
    atlasWidth: number;
    atlasHeight: number;
};

/**
 * A vector font (`.ttf` or `.woff`), returned by `useLoadFont` the moment it is asked for.
 *
 * It is born `'loading'` and fills itself in once the file has arrived and been read. Texts made with
 * it draw nothing until then, and appear on their own when it is ready.
 *
 * Its letters are kept as distance fields in `texture`, drawn the first time each character is
 * needed, so the same font is sharp at any `fontSize`, scale, turn or camera zoom.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFont = {
    readonly type: 'font';
    /**
     * What it is cached under in this game. Its path unless a `key` was given.
     */
    key: string;
    /**
     * Where the file comes from.
     */
    src: string;
    status: TLoadStatus;
    /**
     * How many pixels tall one em of a letter is drawn in `texture`. More is finer detail in thin
     * strokes and a bigger image; it does not change how big texts are on screen.
     */
    size: number;
    /**
     * The image the letters are kept in. Grows, and is uploaded again, as new characters are drawn.
     */
    texture: TTexture;
    /**
     * What the file says, or `null` until it has been read.
     */
    meta: TFontMeta | null;
};
