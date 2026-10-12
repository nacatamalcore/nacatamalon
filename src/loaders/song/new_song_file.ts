import { markWatchable } from '../../store/record_version';
import type { TSongFile } from './types/t_song_file';

/**
 * A song record that has not loaded yet, handed back the moment one is asked for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const newSongFile = (src: string, key: string): TSongFile => markWatchable({
    type: 'song-file',
    key,
    src,
    status: 'loading',
    doc: null,
});

/**
 * A song record for a song already in hand, written in code rather than fetched. Its `src` is empty:
 * there is no file a saved scene could name.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const songFileOf = (doc: TSongFile['doc'], key: string): TSongFile => markWatchable({
    type: 'song-file',
    key,
    src: '',
    status: 'ready',
    doc,
});
