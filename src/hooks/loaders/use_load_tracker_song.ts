import { warnIfKeyTaken } from '../../loaders/key_taken';
import { getActiveBox, getActiveGame } from '../../store';
import { loadTrackerSong, newSongFile } from '../../loaders/song';
import { rootOf } from '../../box';
import { trackLoad } from '../../loaders/track_load';
import type { TSongFile } from '../../loaders/song';
import { assetKey } from '../../loaders/asset_key';

/**
 * What `useLoadTrackerSong` is asked for.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseLoadTrackerSongOptions = {
    /**
     * Where the tracker's text export is: FamiTracker's (File, Export text) or FamiStudio's (File,
     * Export, FamiStudio Text).
     */
    src: string;
    /**
     * Which of its songs, from `0`, when the file holds several. The first by default.
     */
    song?: number;
    /**
     * What to keep it under, so another scene can reach the same one. Defaults to `src` as the page
     * resolves it, so one file written two ways (on a page at the root, `./assets/a.png` and
     * `/assets/a.png`) is kept once and found by either. Any song but the first adds its number.
     */
    key?: string;
};

/**
 * Loads a song made in a NES tracker, FamiTracker or FamiStudio, from its text export, and plays it
 * on the engine's NES: the same song `useLoadSong` gives, for `useSong`, with its own tempo, key,
 * pan and beats. Its DPCM samples come with it, kept in memory.
 *
 * Read when it is loaded, every time the game runs. What it cannot bring over (fine pitch, an
 * expansion chip's voices…) it leaves out and says so once. For a finished game, a `.song` made from
 * it once is quicker to load and says the same every time: the editor makes one when the export is
 * dropped on it, and `importTrackerText` (`nacatamalon/authoring`) does it in a script.
 *
 * Handed back at once and filled in when it lands, like every other asset, and counted by a loading
 * scene the same way. A game that never calls it carries none of the reading.
 *
 * @param options Where the export is, which of its songs, and what to keep it under.
 * @returns The song, to hand to `useSong`.
 *
 * @example
 * ```ts
 * const theme = useLoadTrackerSong({ src: '/music/theme.txt' });
 * useSong(theme, { autoplay: true });
 * ```
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLoadTrackerSong = ({ src, song, key }: TUseLoadTrackerSongOptions): TSongFile => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] useLoadTrackerSong: call it inside a scene body.');
    }

    const cacheKey = key ?? (song === undefined || song === 0 ? assetKey(src) : `${assetKey(src)}#song-${song}`);
    const { songs } = store.get('assets');

    let file = songs.get(cacheKey);
    if (file !== undefined) warnIfKeyTaken('useLoadTrackerSong', cacheKey, file.src, src);
    if (file === undefined) {
        file = newSongFile(src, cacheKey);
        songs.set(cacheKey, file);
        trackLoad(file, loadTrackerSong(store, file, song));
    }

    const { loads } = rootOf(box);
    if (!loads.includes(file)) {
        loads.push(file);
    }

    return file;
};
