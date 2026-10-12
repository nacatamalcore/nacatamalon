import { bumpVersion } from '../../store/record_version';
import { parseMotionDoc } from '../../motion/parse_motion_doc';
import type { TRuntimeStore } from '../../store';
import type { TMotionFile } from './types/t_motion_file';

/**
 * Fetches a `.motion` file and reads it into its record.
 *
 * Never rejects. A file that is missing or cannot be read ends as `'error'` with a warning, and
 * whatever was waiting to play it stays still: a motion that did not arrive costs the motion, not
 * the scene.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const loadMotion = async (store: TRuntimeStore, file: TMotionFile): Promise<void> => {
    try {
        const response = await fetch(file.src);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const doc = parseMotionDoc(await response.json(), file.src);
        if (store.get('loop').destroyed) {
            return;
        }
        file.doc = doc;
        file.status = 'ready';
        bumpVersion(file);
    } catch (error: unknown) {
        file.status = 'error';
        bumpVersion(file);
        console.warn(`[NacatamalOn] useLoadMotion: '${file.src}' could not be loaded. What plays it stays still.`, error);
    }
};
