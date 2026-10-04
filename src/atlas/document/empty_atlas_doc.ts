import { ATLAS_FORMAT } from './atlas_format';
import type { TAtlasDoc } from './types/t_atlas_doc';

/**
 * A new atlas for an image: a grid of square cells and no runs yet.
 *
 * A grid, because nobody starts a packed sheet by hand: a packing tool writes those. The cell size
 * is a guess, 16 pixels, the retro default, for the tool to correct while it shows the cut on the
 * image: a guess that can be seen and fixed beats asking for a number before the sheet is seen.
 *
 * @param options The image, relative to the `.atlas` file, and the cell size when it is known.
 * @returns The new atlas, ready to edit and save.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const emptyAtlasDoc = (options: { texture: string; frameWidth?: number; frameHeight?: number }): TAtlasDoc => {
    const frameWidth = options.frameWidth ?? 16;
    return {
        format: ATLAS_FORMAT,
        kind: 'atlas',
        texture: options.texture,
        // Square unless told otherwise: retro cells are square far more often than not.
        grid: { frameWidth, frameHeight: options.frameHeight ?? frameWidth },
        sequences: {},
    };
};
