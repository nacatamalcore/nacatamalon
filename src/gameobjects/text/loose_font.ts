import { getActiveGame } from '../../store';
import { builtinFontInMemory, isBuiltinFont } from './default_font';
import type { TBitmapFont, TFont } from '../../loaders';

/**
 * The font something is written in away from a text on screen (`drawText`, `measureText`): the one
 * given, the one loaded under a key, or, given none, the font the engine carries, which needs no
 * game and no loading. A key is looked up while a scene is being built, where `createText` looks up
 * its own; `caller` names who asked in what it throws.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const looseFontOf = (font: TBitmapFont | TFont | string | undefined, caller: string): TBitmapFont | TFont => {
    if (font === undefined) {
        return builtinFontInMemory();
    }
    if (typeof font !== 'string') {
        return font;
    }
    if (isBuiltinFont(font)) {
        return builtinFontInMemory(font);
    }
    const store = getActiveGame();
    if (store === null) {
        throw new Error(
            `[NacatamalOn] ${caller}: the font '${font}' is a key, and a key is looked up while a scene ` +
            'is being built. Elsewhere (a useWatch, a useUpdate) pass the font itself.',
        );
    }
    const assets = store.get('assets');
    const found = assets.fonts.get(font) ?? assets.bitmapFonts.get(font);
    if (found === undefined) {
        throw new Error(
            `[NacatamalOn] ${caller}: no font loaded under key '${font}'. ` +
            `Did you forget useLoadFont({ src, key: '${font}' }) in an earlier scene?`,
        );
    }
    return found;
};
