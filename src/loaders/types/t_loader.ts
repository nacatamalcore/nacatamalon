/**
 * How a batch of loads is doing, returned by `useLoader`. Plain data, updated in place as each
 * asset settles, so a scene reads it in `useUpdate` to drive a progress bar or move on.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLoader = {
    /**
     * How many assets the batch tracks.
     */
    total: number;
    /**
     * How many of them have settled, `'ready'` or `'error'`.
     */
    loaded: number;
    /**
     * `loaded / total`, from 0 to 1. `1` for an empty batch.
     */
    progress: number;
    /**
     * `true` once every asset has settled. An error counts as settled: waiting for it would be forever.
     */
    done: boolean;
};
