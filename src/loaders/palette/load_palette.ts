import { bumpVersion } from '../../store/record_version';
import { packPaletteTexels, parsePaletteDoc } from './palette_document';
import type { TPalette } from './types/t_palette';
import type { TRuntimeStore } from '../../store';

/**
 * Fetches a `.palette`, reads it and uploads its one row of pixels.
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
        const response = await fetch(palette.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const doc = parsePaletteDoc(await response.json());

        if (store.get('loop').destroyed) {
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
        palette.status = 'error';
        bumpVersion(palette);
        console.warn(
            `[NacatamalOn] useLoadPalette: '${palette.src}' could not be loaded. ` +
            'Effects matching against it show the frame unchanged.',
            error,
        );
    }
};
