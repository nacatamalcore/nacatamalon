import { bumpVersion } from '../../store/record_version';
import { parseSongDoc } from '../../audio/synth';
import { loadBuiltinSong } from '../../audio/synth/builtin';
import { loadSongSamples } from './load_song_samples';
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
        let doc;
        if (file.src.startsWith('nacatamalon:')) {
            // One of the engine's own, loaded the first time it is asked for.
            const builtin = loadBuiltinSong(file.src);
            if (builtin === null) {
                throw new Error(`the engine has no song '${file.src}': see SONG_BUILTINS for the ones it has`);
            }
            doc = await builtin;
        } else {
            const response = await fetch(file.src);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            doc = parseSongDoc(await response.json(), file.src);
        }
        if (store.get('loop').destroyed) {
            return;
        }
        file.doc = doc;
        // Its samples before it is ready, so the first time it is played they are in it.
        await loadSongSamples(store, file);
        if (store.get('loop').destroyed) {
            return;
        }
        file.status = 'ready';
        bumpVersion(file);
    } catch (error: unknown) {
        file.status = 'error';
        bumpVersion(file);
        console.warn(`[NacatamalOn] useLoadSong: '${file.src}' could not be loaded. Music playing it stays silent.`, error);
    }
};
