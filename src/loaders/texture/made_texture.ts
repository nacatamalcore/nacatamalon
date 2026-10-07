import type { TTexture } from './types/t_texture';

/**
 * Every texture the game worked out instead of loading: pictures drawn into by a component, and
 * pictures painted in code.
 */
const made = new WeakSet<TTexture>();

/**
 * Marks a texture as made in the game rather than loaded from a file.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const markMadeTexture = (texture: TTexture): void => {
    made.add(texture);
};

/**
 * Whether a texture was made in the game rather than loaded from a file.
 *
 * Such a texture has no file behind it, so a scene document can name it but cannot carry it: whoever
 * loads the document has to make it again under the same key first. That is why the writer of a
 * document asks this before listing a texture as an asset.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isMadeTexture = (texture: TTexture): boolean => made.has(texture);
