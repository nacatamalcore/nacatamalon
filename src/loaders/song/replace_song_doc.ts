import { bumpVersion } from '../../store/record_version';
import type { TRuntimeStore } from '../../store';
import type { TSongDoc } from '../../audio/synth';

/**
 * Gives every loaded song from `src` (or kept under that key) a new document, and says so, so each
 * `useSong` playing it makes its tracks again from the same beat. What the editor's `updateSong`
 * does when a `.song` is saved while the game runs.
 *
 * @param store - The game's store.
 * @param src - Where the file is, as the game fetched it (`/music/minuet.song`) or relative to the
 * site (`music/minuet.song`), or the key it was kept under.
 * @param doc - Its new notes.
 * @returns How many songs took it: none when the game has not loaded that file.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const replaceSongDoc = (store: TRuntimeStore, src: string, doc: TSongDoc): number => {
    const relative = src.replace(/^\/+/, '');
    let changed = 0;
    for (const file of store.get('assets').songs.values()) {
        if (file.src === '' || (file.src !== src && file.key !== src && file.src.replace(/^\/+/, '') !== relative)) {
            continue;
        }
        file.doc = doc;
        file.status = 'ready';
        bumpVersion(file);
        changed += 1;
    }
    return changed;
};
