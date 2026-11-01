import type { TColorOption } from '../../../color';
import type { TSpriteTextureSees, TViewFilter } from './t_sprite_texture';

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
     * `'inside'`, the default: only what the component draws, a world of its own. `'3d'`: the
     * models and particles in depth of the world around it as well, seen from the component's own
     * 3D camera (or the scene's, if it asks for none) and lit by the scene's lamps, with whatever
     * the component draws on top. That is a security camera: the flat part of the scene, its sprites
     * and its texts, is not in the room and is not seen.
     *
     * `'world'`: a view of the whole world of its scene, drawn again through the component's own
     * cameras (or the scene's, where it asks for none) and not run a second time: a minimap, a
     * mirror, half of a split screen. Its 2D camera sees the sprites, maps, texts and particles,
     * each placed for it, parallax included; its 3D camera sees the models, and one that follows the
     * 2D (`follow2d`) follows the view's. What is pinned to the screen (`useScreenSpace`) is the
     * screen's and is never in a view, and neither is anything showing the view itself. What the
     * component draws goes on top, and is seen only there: a minimap's marker. It is in the world the
     * view looks at, through the same cameras, lit by the scene's lamps and in its fog, unless the
     * view brings lamps or fog of its own. A picture that sees `'inside'` is a world of its own and
     * is lit only by what is in it.
     */
    sees?: TSpriteTextureSees;
    /**
     * For a view (`'world'`): what of the world it leaves out. `hide` wins over `only`.
     *
     * @example
     * ```ts
     * createSpriteTexture({ width: 96, height: 64, sees: 'world', hide: { kinds: ['particles'], tags: ['scenery'] } }, Minimap);
     * ```
     */
    hide?: TViewFilter;
    /**
     * For a view (`'world'`): what alone of the world it takes in.
     */
    only?: TViewFilter;
    /**
     * What is behind everything drawn into it. Opaque black when left out. A transparent one lets
     * whatever shows the picture be seen through the parts nothing covers.
     */
    background?: TColorOption;
    /**
     * The name the picture is kept under, so a model can ask for it by name the way it asks for a
     * loaded image. A new one of its own when left out.
     *
     * Worth giving in a scene that restarts: the same name and size gets the same picture back
     * instead of a new one each time.
     */
    key?: string;
};
