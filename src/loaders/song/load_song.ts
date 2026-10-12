import { bumpVersion } from '../../store/record_version';
import { parseSongDoc } from '../../audio/synth';
import type { TRuntimeStore } from '../../store';
import type { TSongFile } from './types/t_song_file';

/**
 * Fetches a `.song` file and reads it into its record.
 *
 * Never rejects. A file that is missing or cannot be read ends as `'error'` with a warning, and the
 * music waiting on it stays silent: a song that did not arrive costs the song, not the scene.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadSong = async (store: TRuntimeStore, file: TSongFile): Promise<void> => {
    try {
        const response = await fetch(file.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const doc = parseSongDoc(await response.json(), file.src);
        if (store.get('loop').destroyed) {
            return;
        }
        file.doc = doc;
        file.status = 'ready';
        bumpVersion(file);
    } catch (error: unknown) {
        file.status = 'error';
        bumpVersion(file);
        console.warn(`[NacatamalOn] useLoadSong: '${file.src}' could not be loaded. Music playing it stays silent.`, error);
    }
};
