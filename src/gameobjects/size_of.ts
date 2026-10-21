import { bitmapFontGlyphs } from '../loaders';
import { spriteSize } from '../render/shared/sprite_size';
import { layoutText } from './text/layout_text';
import { layoutFontText } from './text/layout_font_text';
import { builtinFontMeta, isBuiltinFont } from './text/default_font';
import type { TSprite } from './sprite/types/t_sprite';
import type { TText } from './text/types/t_text';
import type { TNineSlice } from './nine_slice/types/t_nine_slice';
import type { TBitmapFontGlyph } from '../loaders';

/**
 * Something drawn flat that `sizeOf` and `boundsOf` measure: a sprite, a text or a panel.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeasurable = TSprite | TText | TNineSlice;

const MIDDLE = { x: 0.5, y: 0.5 };

/** The letters of each built-in font by character, made once: `sizeOf` is asked every frame. */
const builtinGlyphs = new Map<string, Map<string, TBitmapFontGlyph>>();
const TOP_LEFT = { x: 0, y: 0 };

/**
 * Its width and height before its own scale: what it was given, or else what its picture or its
 * letters make it.
 */
const unscaled = (thing: TMeasurable): { width: number; height: number } => {
    if (thing.type === 'nine-slice') {
        return { width: thing.width, height: thing.height };
    }
    if (thing.type === 'sprite') {
        return spriteSize(thing);
    }
    // Laid out now, the same way it is laid out to be drawn, so it is right on the frame it is made.
    const { font, style } = thing;
    if (font.type === 'font') {
        const layout = layoutFontText(thing.text, style, font);
        return { width: layout.width, height: layout.height };
    }
    // A font the engine carries is measured before it has loaded: its letters are worked out, not
    // read from the file.
    if (font.meta === null && isBuiltinFont(font.key)) {
        const meta = builtinFontMeta(font.key);
        let glyphs = builtinGlyphs.get(font.key);
        if (glyphs === undefined) {
            glyphs = new Map(meta.chars.map((glyph) => [glyph.char, glyph]));
            builtinGlyphs.set(font.key, glyphs);
        }
        const layout = layoutText(thing.text, style, meta, glyphs);
        return { width: layout.width, height: layout.height };
    }
    const layout = layoutText(thing.text, style, font.meta, bitmapFontGlyphs(font));
    return { width: layout.width, height: layout.height };
};

/**
 * How big it is, in game pixels, with its own scale: a text of 64 by 8 with `scaleX: 2` is 128 wide.
 *
 * What it was given (`width`, `height`), or else what makes it that size: a sprite's picture or the
 * frame of its sheet, a text's letters. The text is measured as it is now, with the font it has, so
 * it can be read the moment it is made: a box behind a label, a coin after a score. Not yet loaded,
 * a picture or a font measures `0`.
 *
 * Its own scale and not the boxes' above it, and not its turn: the size of what it says it is, in the
 * same place its `transform` is written. Where it sits as well is `boundsOf`.
 *
 * @param thing A sprite, a text or a panel.
 * @returns Its width and height.
 *
 * @example
 * ```ts
 * const label = createText({ text: 'PLAY' });
 * const { width, height } = sizeOf(label);
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sizeOf = (thing: TMeasurable): { width: number; height: number } => {
    const { width, height } = unscaled(thing);
    return { width: Math.abs(width * thing.transform.scaleX), height: Math.abs(height * thing.transform.scaleY) };
};

/**
 * Where it sits and how big it is: the rectangle it covers, `x` and `y` its top-left corner, with its
 * anchor, its pivot and its own scale taken into account.
 *
 * In the same place its `transform` is written, the box it hangs from, and not the world: two things
 * of one box line up with it whatever the box is doing, which is what laying out a HUD or a menu
 * needs. Unturned: a turned thing gives the rectangle it would cover straight.
 *
 * @param thing A sprite, a text or a panel.
 * @returns Its top-left corner and its size.
 *
 * @example
 * ```ts
 * declare const score: TText;
 * declare const coin: TSprite;
 *
 * // The coin just after the score, however long the score has grown.
 * const at = boundsOf(score);
 * coin.transform.x = at.x + at.width + 4;
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const boundsOf = (thing: TMeasurable): { x: number; y: number; width: number; height: number } => {
    const { width, height } = unscaled(thing);
    const { x, y, scaleX, scaleY } = thing.transform;
    const anchor = thing.anchor ?? (thing.type === 'text' ? TOP_LEFT : MIDDLE);
    const pivot = thing.pivot ?? anchor;
    // The pivot stays where it is when it grows: it is the anchor's place, moved by how far apart
    // the two are, and the rest grows out from it.
    const pivotX = x + (pivot.x - anchor.x) * width;
    const pivotY = y + (pivot.y - anchor.y) * height;
    const left = pivotX - pivot.x * width * scaleX;
    const top = pivotY - pivot.y * height * scaleY;
    const right = left + width * scaleX;
    const bottom = top + height * scaleY;
    // A negative scale mirrors it about its pivot: the corner on the left is then the other one.
    return {
        x: Math.min(left, right),
        y: Math.min(top, bottom),
        width: Math.abs(right - left),
        height: Math.abs(bottom - top),
    };
};
