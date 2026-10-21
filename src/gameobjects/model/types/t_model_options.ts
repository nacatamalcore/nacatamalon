import type { T3dOptions } from '../../types/t_3d_options';
import type { TGltfModel } from '../../../loaders';
import type { TLightingLook, TStepLook } from '../../../shader_composer/surface/types';

/**
 * What `createModel` is asked for. Only the model is needed.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TModelOptions = T3dOptions & {
    /**
     * The loaded model, from `useLoadGltf`.
     */
    model: TGltfModel;
    /**
     * How every piece is lit, in place of the engine's light: `toonLighting()` or `unlitLighting()`. Each piece
     * keeps its own picture and colour from the file. A model with bones bends and is lit by it alike.
     */
    lighting?: TLightingLook;
    /**
     * What is done to every piece once it is lit, in order: `mangaDots()`, `rim()`.
     */
    steps?: readonly TStepLook[];
};
