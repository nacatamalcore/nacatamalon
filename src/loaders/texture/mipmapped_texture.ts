import type { TTexture } from './types/t_texture';

/**
 * Every texture that was asked for with mipmaps.
 *
 * Kept beside the record rather than on it, like whether it was made in the game: the record is
 * plain data the whole engine passes around, and this is only the upload's business.
 */
const mipmapped = new WeakSet<TTexture>();

/**
 * Marks a texture to be uploaded with its chain of mipmaps.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const markMipmapped = (texture: TTexture): void => {
    mipmapped.add(texture);
};

/**
 * Whether a texture was asked for with mipmaps.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isMipmapped = (texture: TTexture): boolean => mipmapped.has(texture);
