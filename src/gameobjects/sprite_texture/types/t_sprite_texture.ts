import type { TColor } from '../../../color';
import type { TTexture } from '../../../loaders';

/**
 * What a picture made by `createSpriteTexture` shows: a world of its own, or the one around it too.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteTextureSees = 'inside' | 'scene';

/**
 * A picture that part of a scene is drawn into instead of the screen: a screen inside the game, a
 * monitor, a handheld's display.
 *
 * It sits on the object whose contents it shows. Everything on that object and under it is drawn
 * into `texture` every frame, in the picture's own pixels, and anything else can show `texture` the
 * way it shows a loaded image. The object is where the picture's world ends: a camera asked for in
 * there belongs to the picture, and a lamp in there lights only the picture.
 *
 * Plain data like every record, apart from `texture.gpu`, which is the renderer's.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteTexture = {
    type: 'sprite-texture';
    id: string;
    /**
     * In pixels. Also how wide the world inside is, before any camera.
     */
    width: number;
    /**
     * In pixels. Also how tall the world inside is, before any camera.
     */
    height: number;
    /**
     * What is drawn into it. `'inside'`: only what is on its object and under it, a world of its own.
     * `'scene'`: the models of the world around it as well, seen from its own camera, which is a
     * security camera and a monitor showing it.
     */
    sees: TSpriteTextureSees;
    /**
     * What the picture is cleared to every frame, behind everything drawn into it.
     */
    background: TColor;
    /**
     * The picture itself, ready from the first frame and found in the game's textures by its `key`.
     */
    texture: TTexture;
};
