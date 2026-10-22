import { importFamiStudioText } from './import_famistudio_text';
import { importFamiTrackerText } from './import_famitracker_text';
import type { TTrackerImport } from './build_tracker_song';

export { importFamiStudioText, importFamiTrackerText };
export type { TTrackerImport };

/**
 * Reads a tracker's text export into one of our songs, telling FamiTracker's from FamiStudio's by
 * what is in it: FamiTracker's has `TRACK` lines, FamiStudio's starts with a `Project`.
 *
 * @param text - The exported file's text.
 * @param options - Where its samples are to be saved, and which of its songs. See
 * `importFamiTrackerText`.
 * @returns The song, its samples to save, what could not be brought over, and which tracker wrote it.
 *
 * @category Audio
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const importTrackerText = (
    text: string,
    options: { samplesFolder?: string; song?: number } = {},
): TTrackerImport & { from: 'famitracker' | 'famistudio' } => {
    if (/^\s*Project\s/m.test(text)) {
        return { ...importFamiStudioText(text, options), from: 'famistudio' };
    }
    if (/^\s*TRACK\s/m.test(text) || /^#\s*FamiTracker text export/im.test(text)) {
        return { ...importFamiTrackerText(text, options), from: 'famitracker' };
    }
    throw new Error('[NacatamalOn] importTrackerText: this is not a text export of FamiTracker or FamiStudio. In FamiTracker: File, Export text; in FamiStudio: File, Export, FamiStudio Text.');
};
