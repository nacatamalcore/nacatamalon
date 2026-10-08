import type { TLoadStatus } from '../../types/t_load_status';
import type { TTexture } from '../../texture/types/t_texture';

/**
 * Where one character sits in a font's image, in pixels.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBitmapFontGlyph = {
    /**
     * The character, one per entry.
     */
    char: string;
    /**
     * Left edge in the image.
     */
    x: number;
    /**
     * Top edge in the image.
     */
    y: number;
    /**
     * Width. Every character of a font shares the font's `glyphHeight`.
     */
    w: number;
};

/**
 * A bitmap font's description file, exactly as it is written on disk.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBitmapFontMeta = {
    name: string;
    /**
     * How tall every character is, in pixels of the image.
     */
    glyphHeight: number;
    /**
     * Extra pixels of the image between two characters, added after each one.
     */
    tracking: number;
    /**
     * How far down from the top of a character its baseline is.
     */
    baseline: number;
    atlasWidth: number;
    atlasHeight: number;
    chars: TBitmapFontGlyph[];
};

/**
 * A bitmap font, returned by `useLoadBitmapFont` the moment it is asked for.
 *
 * It is born `'loading'` and fills itself in once both its description and its image have arrived.
 * Texts made with it draw nothing until then, and appear on their own when it is ready.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TBitmapFont = {
    readonly type: 'bitmapFont';
    /**
     * What it is cached under in this game. The description's path unless a `key` was given.
     */
    key: string;
    /**
     * Where the description file comes from.
     */
    src: string;
    status: TLoadStatus;
    /**
     * The image holding every character.
     */
    texture: TTexture;
    /**
     * The description, or `null` until it has arrived.
     */
    meta: TBitmapFontMeta | null;
};
