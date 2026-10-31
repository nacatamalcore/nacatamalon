import type { T3dOptions } from '../../types/t_3d_options';
import type { TColorOption } from '../../../color';
import type { TGeometry } from '../../../geometry';
import type { TMaterialOcclusion, TMeshMaterial } from '../../../materials';
import type { TTexture } from '../../../loaders';

/**
 * What `createMesh` is asked for. Only the shape is needed.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMeshOptions = T3dOptions & {
    /**
     * The shape it is, from one of the shape hooks.
     */
    geometry: TGeometry;
    /**
     * A surface to draw it with, from `createMaterial`, shared with anything else handed the same
     * one.
     *
     * Given one, its surface fields (`tint`, `emissive`, `specular` and the rest of
     * `TMeshSurfaceOptions`) are not read: the material already says all of that, and two places
     * saying it would be two places to disagree.
     */
    material?: TMeshMaterial;
    /**
     * A picture for its surface, from `useLoadTexture`.
     */
    texture?: TTexture;
    /**
     * The key a texture was loaded under, for a model built where the picture is not at hand.
     */
    key?: string;
    /**
     * Light it gives off by itself. Default none.
     */
    emissive?: TColorOption;
    /**
     * A picture the glow comes through, multiplied by `emissive`: white where it glows, black where
     * it does not. Default none, the glow the same all over.
     */
    emissiveTexture?: TTexture;
    /**
     * Where the light from all around is kept out of its creases, the shading a modelling program
     * calls occlusion: a picture whose red is white where the surface is open and black where it is
     * shut in. It darkens only the scene's `ambient`, never a lamp or the sun. The picture alone, or
     * `{ texture, strength, uv, wrap }` to apply less of it, lay it out by a second picture coordinate
     * or give it edges of its own (see {@link TMaterialOcclusion}). Default none.
     */
    occlusion?: TTexture | TMaterialOcclusion;
};
