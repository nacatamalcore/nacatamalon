import { getActiveBox, getActiveGame } from '../../store';
import { loadPalette, newPalette } from '../../loaders/palette';
import { rootOf } from '../../box';
import { trackLoad } from '../../loaders/track_load';
import type { TPalette } from '../../loaders/palette/types/t_palette';

/**
 * What `useLoadPalette` is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadPaletteOptions = {
    /**
     * Where the `.palette` file is.
     */
    src: string;
    /**
     * What to keep it under, so another scene can reach the same one. Defaults to `src`.
     */
    key?: string;
};

/**
 * Loads a set of colours for an effect to match a frame against.
 *
 * Handed back at once and filled in when the file lands, like every other asset. Until then an
 * effect matching against it shows the frame unchanged, so a palette that is slow to arrive costs
 * you the palette and never the picture.
 *
 * @param options Where the file is, and what to keep it under.
 * @returns The palette, to hand to `usePostProcess`.
 *
 * @example
 * ```ts
 * const nes = useLoadPalette({ src: '/palettes/nes.palette' });
 * usePostProcess({ ...paletteMatch(), palette: nes });
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadPalette = ({ src, key }: TUseLoadPaletteOptions): TPalette => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadPalette: call it inside a scene body.');
    }

    const cacheKey = key ?? src;
    const { palettes } = store.get('assets');

    let palette = palettes.get(cacheKey);
    if (palette === undefined) {
        palette = newPalette(src, cacheKey);
        palettes.set(cacheKey, palette);
        trackLoad(palette, loadPalette(store, palette));
    }

    const { loads } = rootOf(box);
    if (!loads.includes(palette)) {
        loads.push(palette);
    }

    return palette;
};
