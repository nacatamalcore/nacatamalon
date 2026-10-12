import type { TLoadStatus } from '../../types/t_load_status';
import type { TMotionDoc } from '../../../motion/types/t_motion_doc';

/**
 * A `.motion` file, on its way in or already here.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionFile = {
    readonly type: 'motion-file';
    /**
     * What it is kept under in this game. The `src` unless a `key` was given.
     */
    key: string;
    /**
     * Empty for a motion written in code rather than fetched.
     */
    src: string;
    status: TLoadStatus;
    /**
     * `null` until it is `'ready'`, and after an error.
     */
    doc: TMotionDoc | null;
};
