import { bumpVersion } from '../../store/record_version';
import { importTrackerText } from '../../authoring/tracker';
import type { TRuntimeStore } from '../../store';
import type { TSongFile } from './types/t_song_file';

/**
 * Fetches a tracker's text export (FamiTracker's or FamiStudio's) and reads it into a song record,
 * its samples kept in the record rather than written out as files.
 *
 * Never rejects. A file that is missing, or is not such an export, ends as `'error'` with a warning,
 * and the music waiting on it stays silent. What the song could not bring over (fine pitch, an
 * expansion chip…) is said once, when it lands.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadTrackerSong = async (store: TRuntimeStore, file: TSongFile, song?: number): Promise<void> => {
    try {
        const response = await fetch(file.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        // Its samples named after the file itself, which no file of the game can be called.
        const imported = importTrackerText(await response.text(), { samplesFolder: `${file.src}#`, song });
        if (store.get('loop').destroyed) {
            return;
        }
        if (imported.warnings.length > 0) {
            console.warn(`[NacatamalOn] useLoadTrackerSong: '${file.src}' plays without some of what it has: ${imported.warnings.join(' ')}`);
        }
        for (const { path, samples, sampleRate } of imported.samples) {
            file.samples.set(path, { samples, sampleRate });
        }
        file.doc = imported.doc;
        file.status = 'ready';
        bumpVersion(file);
    } catch (error: unknown) {
        file.status = 'error';
        bumpVersion(file);
        console.warn(`[NacatamalOn] useLoadTrackerSong: '${file.src}' could not be loaded. Music playing it stays silent.`, error);
    }
};
