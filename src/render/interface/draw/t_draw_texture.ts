import type { ITexture } from '../i_texture';

/**
 * What a backend reads from a sprite's texture. The game's texture record fits this by shape and
 * is passed as it is.
 *
 * - `'loading'`: the sprite is not drawn, so the frame never shows a plain square where the image
 *   is about to appear.
 * - `'ready'`: `gpu` is set and the sprite is drawn with it.
 * - `'error'`: drawn without texture, as its tint, so a missing file is visible.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawTexture = {
    readonly status: 'loading' | 'ready' | 'error';
    readonly gpu: ITexture | null;
    /**
     * In pixels. What a sprite with no `width` of its own is sized by.
     */
    readonly width: number;
    /**
     * In pixels. What a sprite with no `height` of its own is sized by.
     */
    readonly height: number;
};
