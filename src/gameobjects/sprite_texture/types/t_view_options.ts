import type { TSpriteTextureOptions } from './t_sprite_texture_options';

/**
 * What `createView` is asked for: where on the screen the view goes, and the rest as for a view of
 * the world made with `createSpriteTexture` (its size, what is behind it, what of the world it takes
 * in).
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TViewOptions = Omit<TSpriteTextureOptions, 'sees'> & {
    /**
     * Its left edge, in screen pixels: from the left of the game when it is made in the scene's body,
     * and from where the piece it is made in is placed otherwise.
     */
    x: number;
    /**
     * Its top edge, in screen pixels, measured as `x` is.
     */
    y: number;
};
