import { rootOf } from '../../box';
import { loadBitmapFont, newBitmapFont, trackLoad } from '../../loaders';
import { DEFAULT_FONT_ATLAS } from './default_font_atlas';
import { setBitmapFontPixels } from '../../loaders/bitmap_font/bitmap_font_pixels';
import { decodePng } from '../../pixels/decode_png';
import type { TBox } from '../../box';
import type { TBitmapFont, TBitmapFontMeta } from '../../loaders';
import type { TRuntimeStore } from '../../store';

/**
 * The key the default font is kept under, in a game's fonts and in a saved scene. Reserved: a scene
 * whose text names it needs no font file in its manifest, because every game already has it.
 */
export const DEFAULT_FONT_KEY = 'nacatamalon:arcade';

/**
 * Every character the default font has, in the order its image holds them: printable ASCII, then
 * the Spanish letters and marks and a few more.
 */
const DEFAULT_FONT_CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~¡¿ÁÉÍÓÚÜÑáéíóúüñÀÈÒàèòÇç·€©';

const COLUMNS = 16;
const CELL = 8;

/**
 * Where each character is, worked out rather than written down: the image is a plain grid of 8 x 8
 * cells, sixteen to a row. One pixel of tracking, the spacing of the arcade fonts it stands in for.
 */
const DEFAULT_FONT_META: TBitmapFontMeta = {
    name: 'Nacatamal Arcade',
    glyphHeight: CELL,
    tracking: 1,
    baseline: 7,
    atlasWidth: COLUMNS * CELL,
    atlasHeight: Math.ceil([...DEFAULT_FONT_CHARS].length / COLUMNS) * CELL,
    chars: [...DEFAULT_FONT_CHARS].map((char, i) => ({ char, x: (i % COLUMNS) * CELL, y: Math.floor(i / COLUMNS) * CELL, w: CELL })),
};

/**
 * The font a text uses when it is given none: Nacatamal Arcade, carried inside the engine, so
 * `createText({ text: 'SCORE 0' })` shows without loading anything.
 *
 * It goes through the same loader as `useLoadBitmapFont`, from `data:` addresses instead of files, so it
 * behaves exactly like a loaded font: one per game, ready a moment after the scene starts, and
 * counted by `useLoader()` like any other. Its description is handed over the same way, which is why
 * it is a `data:` address too rather than set directly.
 */
export const defaultFontOf = (store: TRuntimeStore, box: TBox): TBitmapFont => {
    const { bitmapFonts } = store.get('assets');
    let font = bitmapFonts.get(DEFAULT_FONT_KEY);
    if (font === undefined) {
        const json = `data:application/json,${encodeURIComponent(JSON.stringify(DEFAULT_FONT_META))}`;
        font = newBitmapFont(json, DEFAULT_FONT_ATLAS, DEFAULT_FONT_KEY);
        bitmapFonts.set(DEFAULT_FONT_KEY, font);
        trackLoad(font, loadBitmapFont(store, font));
    }
    const { loads } = rootOf(box);
    if (!loads.includes(font)) {
        loads.push(font);
    }
    return font;
};

/**
 * The same font for painting into pixels: built from the image already inside the engine, read on
 * the spot, so `drawText` with no font needs no game and no wait. One for the whole page, since it
 * is the same picture for every game.
 */
let inMemory: TBitmapFont | null = null;

/**
 * The default font with its picture in memory, ready the moment it is asked for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const defaultFontInMemory = (): TBitmapFont => {
    if (inMemory === null) {
        const font = newBitmapFont(DEFAULT_FONT_KEY, DEFAULT_FONT_ATLAS, DEFAULT_FONT_KEY);
        const binary = atob(DEFAULT_FONT_ATLAS.slice(DEFAULT_FONT_ATLAS.indexOf(',') + 1));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        setBitmapFontPixels(font, decodePng(bytes));
        font.meta = DEFAULT_FONT_META;
        font.status = 'ready';
        inMemory = font;
    }
    return inMemory;
};
