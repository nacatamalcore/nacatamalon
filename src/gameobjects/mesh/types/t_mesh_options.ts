import type { T3dOptions } from '../../types/t_3d_options';
import type { TColorOption } from '../../../color';
import type { TGeometry } from '../../../geometry';
import type { TMeshMaterial } from '../../../materials';
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
};
