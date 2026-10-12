import { getActiveBox, getActiveGame } from '../../store';
import { loadSong, newSongFile } from '../../loaders/song';
import { rootOf } from '../../box';
import { trackLoad } from '../../loaders/track_load';
import type { TSongFile } from '../../loaders/song';

/**
 * What `useLoadSong` is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadSongOptions = {
    /**
     * Where the `.song` file is.
     */
    src: string;
    /**
     * What to keep it under, so another scene can reach the same one. Defaults to `src`.
     */
    key?: string;
};

/**
 * Loads a song written as notes: a `.song` file, a few kilobytes where the same tune recorded would
 * be megabytes.
 *
 * Handed back at once and filled in when it lands, like every other asset, and counted by a loading
 * scene the same way.
 *
 * @param options Where the file is, and what to keep it under.
 * @returns The song, to hand to `useSong`.
 *
 * @example
 * ```ts
 * const theme = useLoadSong({ src: '/music/minuet.song' });
 * useSong(theme, { autoplay: true });
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadSong = ({ src, key }: TUseLoadSongOptions): TSongFile => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadSong: call it inside a scene body.');
    }

    const cacheKey = key ?? src;
    const { songs } = store.get('assets');

    let file = songs.get(cacheKey);
    if (file === undefined) {
        file = newSongFile(src, cacheKey);
        songs.set(cacheKey, file);
        trackLoad(file, loadSong(store, file));
    }

    const { loads } = rootOf(box);
    if (!loads.includes(file)) {
        loads.push(file);
    }

    return file;
};
