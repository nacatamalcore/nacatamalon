import type { TColor } from '../../../color';
import type { TGltfModel } from '../../../loaders';
import type { TTransform3d } from '../../types/t_transform_3d';
import type { TTextureWrap } from '../../../materials';

/**
 * What `createModel` is asked for. Only the model is needed.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TModelOptions = {
    /**
     * The loaded model, from `useLoadGltf`.
     */
    model: TGltfModel;
    /**
     * Where it is. Anything left out is at the origin, unturned and unscaled.
     */
    transform?: Partial<TTransform3d>;
    /**
     * Multiplies the colour of every piece, so the file's own colours are kept and shaded: white,
     * the default, leaves it exactly as it was made.
     */
    tint?: TColor;
    /**
     * How solid it is, `0` to `1`. Default `1`.
     */
    alpha?: number;
    /**
     * Drawn as see-through even at full `alpha`. Omitted, each piece is see-through when the file
     * says so (`alphaMode: 'BLEND'`) or when its alpha is below `1`.
     */
    transparent?: boolean;
    /**
     * The colour of its shine. Default none, which is a matt surface.
     */
    specular?: TColor;
    /**
     * How tight that shine is. Default `32`. Higher is smaller and harder.
     */
    shininess?: number;
    /**
     * Its corners land on a coarse grid of the screen, the way the PlayStation drew them: a model
     * shivers as it moves and its edges crawl as the camera turns. A number is how many rows the grid
     * has (`120` is the classic look, smaller is wilder); `true` uses the game's own rows, which is
     * subtle. Default `false`.
     */
    vertexSnap?: boolean | number;
    /**
     * Its picture is stretched straight across the screen without correcting for depth, the way the
     * PlayStation drew it: big flat surfaces bend and swim as the camera comes close. Default `false`.
     */
    affine?: boolean;
    /**
     * Overrides the game's `smooth` for this model alone.
     */
    smooth?: boolean;
    /**
     * What every picture on it does past its edge, over what the file says. Omitted, each piece
     * does what its file asked, which is almost always to repeat.
     */
    wrap?: TTextureWrap | { u: TTextureWrap; v: TTextureWrap };
    /**
     * Draw order within its scene. Default `0`, and on a tie a model goes under a sprite.
     */
    zIndex?: number;
    /**
     * Whether it is drawn. Default `true`.
     */
    visible?: boolean;
};
