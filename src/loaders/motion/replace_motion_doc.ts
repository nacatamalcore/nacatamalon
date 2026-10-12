import { bumpVersion } from '../../store/record_version';
import type { TRuntimeStore } from '../../store';
import type { TMotionDoc } from '../../motion/types/t_motion_doc';

/**
 * Gives every loaded motion from `src` (or kept under that key) a new document, and says so, so each
 * `useMotion` playing it finds its fields again and carries on from the same moment. What the
 * editor's `updateMotion` does when a `.motion` is saved while the game runs.
 *
 * @param store - The game's store.
 * @param src - Where the file is, as the game fetched it (`/motions/intro.motion`) or relative to the
 * site (`motions/intro.motion`), or the key it was kept under.
 * @param doc - Its new tracks and events.
 * @returns How many motions took it: none when the game has not loaded that file.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const replaceMotionDoc = (store: TRuntimeStore, src: string, doc: TMotionDoc): number => {
    const relative = src.replace(/^\/+/, '');
    let changed = 0;
    for (const file of store.get('assets').motions.values()) {
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
