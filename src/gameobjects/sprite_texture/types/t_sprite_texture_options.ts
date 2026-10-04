import type { TColor } from '../../../color';
import type { TSpriteTextureSees } from './t_sprite_texture';

/**
 * What `createSpriteTexture` is asked for.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteTextureOptions = {
    /**
     * In pixels, rounded down and at least 1.
     */
    width: number;
    /**
     * In pixels, rounded down and at least 1.
     */
    height: number;
    /**
     * `'inside'`, the default: only what the component draws, a world of its own. `'scene'`: the
     * models and particles in depth of the world around it as well, seen from the component's own
     * 3D camera (or the scene's, if it asks for none) and lit by the scene's lamps, with whatever
     * the component draws on top. That is a security camera: the flat part of the scene, its sprites
     * and its texts, is not in the room and is not seen.
     */
    sees?: TSpriteTextureSees;
    /**
     * What is behind everything drawn into it. Opaque black when left out. A transparent one lets
     * whatever shows the picture be seen through the parts nothing covers.
     */
    background?: TColor;
    /**
     * The name the picture is kept under, so a model can ask for it by name the way it asks for a
     * loaded image. A new one of its own when left out.
     *
     * Worth giving in a scene that restarts: the same name and size gets the same picture back
     * instead of a new one each time.
     */
    key?: string;
};
