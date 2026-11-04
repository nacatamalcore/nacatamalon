import { bumpVersion } from '../../store/record_version';
import { PALETTE_FORMAT, packPaletteTexels, parsePaletteDoc } from './palette_document';
import type { TConsolePaletteName } from './console_palettes';
import type { TPalette, TPaletteDoc } from './types/t_palette';
import type { TRuntimeStore } from '../../store';

/**
 * What names one of the engine's palettes rather than a file, as it does a font or a song.
 */
const BUILT_IN = 'nacatamalon:';

const fetchPalette = async (src: string): Promise<TPaletteDoc> => {
    const response = await fetch(src);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return parsePaletteDoc(await response.json(), src);
};

/**
 * One of the engine's palettes, imported when one is asked for, as the engine's songs are. Their
 * colours are a kilobyte, and `BUILTIN` reads the same list, so a bundler may keep them either way.
 */
const builtInPalette = async (name: string): Promise<TPaletteDoc> => {
    const { CONSOLE_PALETTES } = await import('./console_palettes');
    if (!Object.hasOwn(CONSOLE_PALETTES, name)) {
        throw new Error(`The engine has no palette called '${name}'. It has: ${Object.keys(CONSOLE_PALETTES).join(', ')}.`);
    }
    return { format: PALETTE_FORMAT, kind: 'palette', name, colors: [...CONSOLE_PALETTES[name as TConsolePaletteName]] };
};

/**
 * Fetches a `.palette`, or takes one of the engine's, reads it and uploads its one row of pixels.
 *
 * Never rejects. A file that is missing or unreadable ends as `'error'` with a warning, and every
 * effect matching against it goes on showing the frame untouched: losing a palette should cost you
 * the palette, not the picture.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadPalette = async (store: TRuntimeStore, palette: TPalette): Promise<void> => {
    try {
        const doc = palette.src.startsWith(BUILT_IN) ? await builtInPalette(palette.src.slice(BUILT_IN.length)) : await fetchPalette(palette.src);

        if (store.get('loop').destroyed || palette.status === 'released') {
            return;
        }

        palette.name = doc.name;
        palette.colors = doc.colors;
        // One row, one pixel per colour: an effect asks how many there are and then for the nth,
        // and neither question needs a second dimension.
        palette.gpu = store.get('screen').renderer.createDataTexture(
            packPaletteTexels(doc.colors),
            Math.max(doc.colors.length, 1),
            1,
        );
        palette.status = 'ready';
        bumpVersion(palette);
    } catch (error: unknown) {
        if (palette.status === 'released') {
            return;
        }
        palette.status = 'error';
        bumpVersion(palette);
        console.warn(
            `[NacatamalOn] useLoadPalette: '${palette.src}' could not be loaded. ` +
            'Effects matching against it show the frame unchanged.',
            error,
        );
    }
};
