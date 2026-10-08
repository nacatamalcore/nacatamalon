import { bumpVersion } from '../../store/record_version';
import { generateMsdf } from './msdf/generate_msdf';
import { newFontAtlas, packGlyph } from './font_atlas';
import type { TRuntimeStore } from '../../store';
import type { TFontAtlas } from './font_atlas';
import type { TParsedFont } from './sfnt/parse_font';
import type { TFont } from './types/t_font';

/**
 * One character of a vector font, ready to be placed: how far it moves the pen, and where its
 * picture is in the atlas and against the pen. A character with nothing to draw (a space) has a
 * picture `0` wide.
 *
 * @internal
 */
export type TFontGlyph = {
    /**
     * Its number in the font, which is what kerning is looked up by.
     */
    glyph: number;
    /**
     * How far it moves the pen, in font units.
     */
    advance: number;
    /**
     * Where its picture is in the atlas, in atlas pixels.
     */
    x: number;
    y: number;
    width: number;
    height: number;
    /**
     * From the pen to the picture's left edge, and from the baseline up to its top, in atlas pixels.
     */
    left: number;
    top: number;
};

/**
 * Everything a loaded font needs that is not plain data: the file it was read from, its atlas, the
 * characters drawn so far, and the game whose renderer holds its texture.
 */
type TFontState = {
    parsed: TParsedFont;
    atlas: TFontAtlas;
    glyphs: Map<number, TFontGlyph>;
    store: TRuntimeStore;
    warnedFull: boolean;
};

/**
 * Beside each font rather than inside it, so the record stays something that can be saved.
 */
const states = new WeakMap<TFont, TFontState>();

/**
 * Hands a font what its file said, and the game to upload its letters to. From here on it can be
 * asked for characters.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const attachFont = (font: TFont, parsed: TParsedFont, store: TRuntimeStore): void => {
    states.set(font, { parsed, atlas: newFontAtlas(), glyphs: new Map(), store, warnedFull: false });
};

/**
 * The read font behind a font record, or `undefined` before it has loaded.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parsedFontOf = (font: TFont): TParsedFont | undefined => states.get(font)?.parsed;

/**
 * A character of a font, drawn into the atlas the first time it is asked for. A character the font
 * does not have comes back as the font's own "missing" glyph, usually a box, which is what tells a
 * player a letter is missing rather than silently dropping it. `undefined` until the font has loaded.
 *
 * New letters are written into the atlas in memory; `uploadFontAtlas` sends them to the screen.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fontGlyph = (font: TFont, char: string): TFontGlyph | undefined => {
    const state = states.get(font);
    if (state === undefined) {
        return undefined;
    }
    const { parsed, glyphs } = state;
    const glyph = parsed.glyphIndex(char.codePointAt(0) ?? 0);
    const known = glyphs.get(glyph);
    if (known !== undefined) {
        return known;
    }

    const scale = font.size / parsed.unitsPerEm;
    const entry: TFontGlyph = { glyph, advance: parsed.advance(glyph), x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 };
    const field = generateMsdf(parsed.outline(glyph), scale);
    if (field !== null) {
        const place = packGlyph(state.atlas, field.width, field.height, field.data);
        if (place === null) {
            if (!state.warnedFull) {
                state.warnedFull = true;
                console.warn(`[NacatamalOn] createText: '${font.key}' has drawn so many different characters that its atlas is full. New ones will not show; a smaller size in useLoadFont leaves room for more.`);
            }
        } else {
            entry.x = place.x;
            entry.y = place.y;
            entry.width = field.width;
            entry.height = field.height;
            entry.left = field.left;
            entry.top = field.top;
        }
    }
    glyphs.set(glyph, entry);
    return entry;
};

/**
 * How much closer (negative) or further apart two characters sit, in font units.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fontKerning = (font: TFont, left: TFontGlyph, right: TFontGlyph): number =>
    states.get(font)?.parsed.kerning(left.glyph, right.glyph) ?? 0;

/**
 * Sends what changed in a font's atlas to the screen: the new letters only, or the whole picture
 * again when it had to grow. Cheap to call when nothing changed, which is most frames.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const uploadFontAtlas = (font: TFont): void => {
    const state = states.get(font);
    if (state === undefined || state.store.get('loop').destroyed) {
        return;
    }
    const { atlas, store } = state;
    const renderer = store.get('screen').renderer;
    const { texture } = font;

    if (atlas.resized || texture.gpu === null) {
        if (texture.gpu !== null) {
            renderer.destroyTexture(texture.gpu);
        }
        texture.gpu = renderer.createDataTexture(atlas.data, atlas.width, atlas.height);
        texture.width = atlas.width;
        texture.height = atlas.height;
        texture.status = 'ready';
        if (font.meta !== null) {
            font.meta.atlasWidth = atlas.width;
            font.meta.atlasHeight = atlas.height;
        }
        atlas.resized = false;
        atlas.dirty = null;
        bumpVersion(texture);
        return;
    }
    const dirty = atlas.dirty;
    if (dirty !== null) {
        renderer.updateDataTexture(texture.gpu, atlas.data, atlas.width, atlas.height, {
            x: dirty.x0,
            y: dirty.y0,
            width: dirty.x1 - dirty.x0,
            height: dirty.y1 - dirty.y0,
        });
        atlas.dirty = null;
    }
};
