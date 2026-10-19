import { rootOf } from '../../box';
import { loadBitmapFont, newBitmapFont, trackLoad } from '../../loaders';
import { ARCADE_FONT } from './fonts/arcade_font';
import { SQUARE_FONT } from './fonts/square_font';
import { THIN_FONT } from './fonts/thin_font';
import { setBitmapFontPixels } from '../../loaders/bitmap_font/bitmap_font_pixels';
import { decodePng } from '../../pixels/decode_png';
import type { TBox } from '../../box';
import type { TBitmapFont, TBitmapFontMeta } from '../../loaders';
import type { TRuntimeStore } from '../../store';
import type { TBuiltinFont } from './types/t_builtin_font';

/**
 * The key the default font is kept under, in a game's fonts and in a saved scene. Reserved: a scene
 * whose text names it needs no font file in its manifest, because every game already has it.
 */
export const DEFAULT_FONT_KEY = ARCADE_FONT.key;

/**
 * The fonts every game has, by their reserved keys: Nacatamal Arcade (the default), Nacatamal
 * Square and Nacatamal Thin. Each holds the same characters, in the same order: printable ASCII,
 * then the Spanish letters and marks and a few more, then arrows and buttons for on-screen prompts.
 */
const BUILTIN_FONTS = new Map<string, TBuiltinFont>([ARCADE_FONT, SQUARE_FONT, THIN_FONT].map((font) => [font.key, font]));

/**
 * Whether a key names one of the fonts built into the engine, which no manifest lists.
 */
export const isBuiltinFont = (key: string): boolean => BUILTIN_FONTS.has(key);

const COLUMNS = 16;
const CELL = 8;

/**
 * Where each character is, worked out rather than written down: the image is a plain grid of 8 x 8
 * cells, sixteen to a row. One pixel of tracking, the spacing of the arcade fonts it stands in for.
 */
const metaOf = (font: TBuiltinFont): TBitmapFontMeta => ({
    name: font.name,
    glyphHeight: CELL,
    tracking: font.tracking,
    baseline: font.baseline,
    atlasWidth: COLUMNS * CELL,
    atlasHeight: Math.ceil([...font.chars].length / COLUMNS) * CELL,
    chars: [...font.chars].map((char, i) => ({ char, x: (i % COLUMNS) * CELL, y: Math.floor(i / COLUMNS) * CELL, w: Number(font.widths[i]) })),
});

const builtinFont = (key: string): TBuiltinFont => {
    const font = BUILTIN_FONTS.get(key);
    if (font === undefined) {
        throw new Error(`[NacatamalOn] '${key}' is not a font built into the engine: ${[...BUILTIN_FONTS.keys()].join(', ')}.`);
    }
    return font;
};

/**
 * A font carried inside the engine: by default Nacatamal Arcade, the font a text uses when it is
 * given none, so `createText({ text: 'SCORE 0' })` shows without loading anything.
 *
 * It goes through the same loader as `useLoadBitmapFont`, from `data:` addresses instead of files, so it
 * behaves exactly like a loaded font: one per game, ready a moment after the scene starts, and
 * counted by `useLoader()` like any other. Its description is handed over the same way, which is why
 * it is a `data:` address too rather than set directly.
 */
export const builtinFontOf = (store: TRuntimeStore, box: TBox, key: string = DEFAULT_FONT_KEY): TBitmapFont => {
    const { bitmapFonts } = store.get('assets');
    let font = bitmapFonts.get(key);
    if (font === undefined) {
        const builtin = builtinFont(key);
        const json = `data:application/json,${encodeURIComponent(JSON.stringify(metaOf(builtin)))}`;
        font = newBitmapFont(json, builtin.atlas, key);
        bitmapFonts.set(key, font);
        trackLoad(font, loadBitmapFont(store, font));
    }
    const { loads } = rootOf(box);
    if (!loads.includes(font)) {
        loads.push(font);
    }
    return font;
};

/**
 * The same fonts for painting into pixels: built from the image already inside the engine, read on
 * the spot, so `drawText` with no font needs no game and no wait. One of each for the whole page,
 * since it is the same picture for every game.
 */
const inMemory = new Map<string, TBitmapFont>();

/**
 * A built-in font with its picture in memory, ready the moment it is asked for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const builtinFontInMemory = (key: string = DEFAULT_FONT_KEY): TBitmapFont => {
    let font = inMemory.get(key);
    if (font === undefined) {
        const builtin = builtinFont(key);
        font = newBitmapFont(key, builtin.atlas, key);
        const binary = atob(builtin.atlas.slice(builtin.atlas.indexOf(',') + 1));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        setBitmapFontPixels(font, decodePng(bytes));
        font.meta = metaOf(builtin);
        font.status = 'ready';
        inMemory.set(key, font);
    }
    return font;
};
