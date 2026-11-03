import type { TAsset } from './types/t_asset';

/**
 * What the editor took out of the game to load afresh (`evictAsset`), because its file changed on
 * disk.
 *
 * Kept so what still holds one of these by hand asks for it again rather than going on with the old
 * version: an effect written in code is in no cache, so it is never taken out with the rest, and it
 * holds its children, its sheet and its picture itself. Held weakly, so being one keeps nothing alive.
 */
const forgotten = new WeakSet<TAsset>();

/**
 * Notes that `asset` was taken out of the game to be loaded afresh.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const forgetAsset = (asset: TAsset): void => {
    forgotten.add(asset);
};

/**
 * Whether `asset` was taken out of the game to be loaded afresh, so whatever wants it asks again.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isForgotten = (asset: TAsset): boolean => forgotten.has(asset);
