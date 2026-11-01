import type { TAsset } from './types/t_asset';

/**
 * What the game itself asked for by name (`useLoadTexture`, `useLoadAtlas`), as opposed to what
 * only came in because a file it loaded names it: a particle file's picture, a model's.
 *
 * The cache is shared, so the two can be the very same record, and letting go of the file must not
 * take what the game also asked for itself: a sprite showing the spark the game loaded would go
 * blank because an effect that used the same picture went. What the game asked for goes when the
 * game lets go of it.
 */
const asked = new WeakSet<TAsset>();

/**
 * Notes that the game asked for `asset` itself.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const markAskedByGame = (asset: TAsset): void => {
    asked.add(asset);
};

/**
 * Whether the game asked for `asset` itself, so only letting go of it takes it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const askedByGame = (asset: TAsset): boolean => asked.has(asset);
