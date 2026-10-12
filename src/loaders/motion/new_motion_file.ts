import { markWatchable } from '../../store/record_version';
import type { TMotionFile } from './types/t_motion_file';

/**
 * A motion record that has not loaded yet, handed back the moment one is asked for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newMotionFile = (src: string, key: string): TMotionFile => markWatchable({
    type: 'motion-file',
    key,
    src,
    status: 'loading',
    doc: null,
});

/**
 * A motion record for a motion already in hand, written in code rather than fetched. Its `src` is
 * empty: there is no file a saved scene could name.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const motionFileOf = (doc: TMotionFile['doc'], key: string): TMotionFile => markWatchable({
    type: 'motion-file',
    key,
    src: '',
    status: 'ready',
    doc,
});
