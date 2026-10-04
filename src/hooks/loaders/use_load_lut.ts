import { getActiveBox, getActiveGame } from '../../store';
import { loadLut, newLut } from '../../loaders/lut';
import { rootOf } from '../../box';
import { trackLoad } from '../../loaders/track_load';
import type { TLut } from '../../loaders/lut/types/t_lut';

/**
 * What `useLoadLut` is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadLutOptions = {
    /**
     * Where the table is: a `.cube` file, or a strip image.
     */
    src: string;
    /**
     * What to keep it under, so another scene can reach the same one. Defaults to `src`.
     */
    key?: string;
};

/**
 * Loads a colour grading table.
 *
 * Both shapes a table comes in are read here and end up the same: a `.cube` is text written by a
 * grading tool, a strip is a picture of the same numbers, and which one you have is a fact about
 * where it came from rather than about what it does.
 *
 * Handed back at once and filled in when the file lands. Until then an effect grading with it shows
 * the frame unchanged.
 *
 * @param options Where the file is, and what to keep it under.
 * @returns The table, to hand to `usePostProcess`.
 *
 * @example
 * ```ts
 * const evening = useLoadLut({ src: '/luts/evening.cube' });
 * usePostProcess({ ...lutGrade({ amount: 0.8 }), lut: evening });
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadLut = ({ src, key }: TUseLoadLutOptions): TLut => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadLut: call it inside a scene body.');
    }

    const cacheKey = key ?? src;
    const { luts } = store.get('assets');

    let lut = luts.get(cacheKey);
    if (lut === undefined) {
        lut = newLut(src, cacheKey);
        luts.set(cacheKey, lut);
        trackLoad(lut, loadLut(store, lut));
    }

    const { loads } = rootOf(box);
    if (!loads.includes(lut)) {
        loads.push(lut);
    }

    return lut;
};
