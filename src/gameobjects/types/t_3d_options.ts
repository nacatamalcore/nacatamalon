import type { TColorOption } from '../../color';
import type { TCullMode, TTextureWrap } from '../../materials';
import type { TTransform3d } from './t_transform_3d';

/**
 * How the surface of a lit model is painted: what ends up in its material. A model placed from a
 * file has the same, laid over each piece's own.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshSurfaceOptions = {
    /**
     * Multiplies its colour: its picture's, or the colours a model's file gave each piece, so they are
     * kept and shaded. White, the default, leaves it as it is. Any colour: `'#c08040'`, `0xc08040`.
     */
    tint?: TColorOption;
    /**
     * How solid it is, `0` to `1`. Default `1`.
     */
    alpha?: number;
    /**
     * Drawn as see-through even at full `alpha`: for a shader that works out its own alpha, or a
     * picture with see-through parts. Omitted, it is see-through when `alpha` or its tint's own is
     * below `1`, or when a model's file says a piece is (`alphaMode: 'BLEND'`). A see-through model is
     * drawn after the solid ones, furthest first, and hides nothing.
     */
    transparent?: boolean;
    /**
     * The colour of its shine. Default none, which is a matt surface: a shine is the thing that
     * makes something read as wet, polished or metal, and everything else looks better without it.
     */
    specular?: TColorOption;
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
     * Which side of its triangles is thrown away. `'back'` (the default) is a shape seen from
     * outside; `'front'` one seen from inside, such as a dome of sky; `'none'` draws both sides, each
     * lit as the side it is, for a leaf, a sheet or the top of a liquid.
     */
    cull?: TCullMode;
    /**
     * Overrides the game's `smooth` for this model alone.
     */
    smooth?: boolean;
    /**
     * What its picture does past its edge. Default `'repeat'`, or what a model's file asked for each
     * piece, which is almost always to repeat.
     */
    wrap?: TTextureWrap | { u: TTextureWrap; v: TTextureWrap };
};

/**
 * What the lit models share, a shape made with `createMesh` and a model placed from a file with
 * `createModel`: where it is, how it is drawn and how its surface is painted. Each adds what is its
 * own (the shape and its material; the file and its looks).
 *
 * The 3D side of `T2dOptions`, and as narrow: only the lit models use it. What else is drawn in three
 * dimensions (particles, lines) has options of its own, and something new that is not a lit model does
 * not have to fit it.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type T3dOptions = TMeshSurfaceOptions & {
    /**
     * Where it is. Anything left out is at the origin, unturned and unscaled.
     */
    transform?: Partial<TTransform3d>;
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
