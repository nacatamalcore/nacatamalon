import type { TLoadStatus } from '../../types/t_load_status';

/**
 * A sound asset, returned by `useLoadAudio` the moment it is asked for.
 *
 * It is born `'loading'` with no length, and the loader fills it in place once the file has been
 * fetched and decoded. Anything holding it (a `useSound`) sees the change with no re-wiring, which
 * is why it is filled in rather than replaced.
 *
 * Everything but `buffer` is plain data. `buffer` is the decoded sound inside the browser's audio
 * engine: runtime only, and `null` until it is ready, exactly like `gpu` in a texture.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAudioClip = {
    type: 'audio';
    /**
     * What it is cached under in this game. The `src` unless a `key` was given.
     */
    key: string;
    /**
     * Where the file comes from.
     */
    src: string;
    /**
     * How long it lasts, in seconds. `0` until it is `'ready'`.
     */
    duration: number;
    status: TLoadStatus;
    /**
     * The decoded sound. `null` while loading and after an error.
     */
    buffer: AudioBuffer | null;
};
