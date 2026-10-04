import type { TColor } from '../../../color';
import type { TGeometry } from '../../../geometry';
import type { TMeshMaterial } from '../../../materials';
import type { TTexture } from '../../../loaders';
import type { TTransform3d } from '../../types/t_transform_3d';
import type { TTextureWrap } from '../../../materials';

/**
 * What `createMesh` is asked for. Only the shape is needed.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshOptions = {
    /**
     * The shape it is, from one of the shape hooks.
     */
    geometry: TGeometry;
    /**
     * A surface to draw it with, from `createMaterial`, shared with anything else handed the same
     * one.
     *
     * Given one, the loose surface fields below are not read: the material already says all of that,
     * and two places saying it would be two places to disagree.
     */
    material?: TMeshMaterial;
    /**
     * Where it is. Anything left out is at the origin, unturned and unscaled.
     */
    transform?: Partial<TTransform3d>;
    /**
     * A picture for its surface, from `useLoadTexture`.
     */
    texture?: TTexture;
    /**
     * The key a texture was loaded under, for a model built where the picture is not at hand.
     */
    key?: string;
    /**
     * Multiplies the picture, and is the whole colour without one. Default white.
     */
    tint?: TColor;
    /**
     * Light it gives off by itself. Default none.
     */
    emissive?: TColor;
    /**
     * The colour of its shine. Default none, which is a matt surface: a shine is the thing that
     * makes something read as wet, polished or metal, and everything else looks better without it.
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
     * How solid it is, `0` to `1`. Default `1`.
     */
    alpha?: number;
    /**
     * Drawn as see-through even at full `alpha`: for a shader that works out its own alpha, or a
     * picture with see-through parts. Omitted, it is see-through when `alpha` or its tint's own is
     * below `1`. A see-through model is drawn after the solid ones, furthest first, and hides nothing.
     */
    transparent?: boolean;
    /**
     * Overrides the game's `smooth` for this model alone.
     */
    smooth?: boolean;
    /**
     * What its picture does past its edge. Default `'repeat'`, as for any model.
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
    /**
     * Whether it is drawn into the shadow map. Default `true`.
     *
     * `false` is for the things a shadow of would be wrong rather than expensive: the ground the
     * shadows land on, a decal, a pane of glass, the soft disc of a blob shadow. None of it costs
     * anything unless some light in the scene asked to cast in the first place.
     *
     * There is no matching `receiveShadow`. Everything drawn in three dimensions receives, including
     * a model wearing a shader you wrote yourself, because a surface that silently stopped taking
     * shadows the moment you gave it an effect is a surprise with nothing to explain it.
     */
    castShadow?: boolean;
};
