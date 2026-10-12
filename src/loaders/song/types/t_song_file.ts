import type { TLoadStatus } from '../../types/t_load_status';
import type { TSongDoc } from '../../../audio/synth';

/**
 * A `.song` file, on its way in or already here.
 *
 * It holds the song as written, not as sound: every `useSong` playing it turns it into sound itself,
 * because each can be at its own tempo and in its own key.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSongFile = {
    readonly type: 'song-file';
    /**
     * What it is kept under in this game. The `src` unless a `key` was given.
     */
    key: string;
    /**
     * Empty for a song written in code rather than fetched.
     */
    src: string;
    status: TLoadStatus;
    /**
     * `null` until it is `'ready'`, and after an error.
     */
    doc: TSongDoc | null;
};
