/**
 * The parts a filter layer laid with depth is laid in, the same in every backend: see the WebGPU
 * `filter_depth.ts`.
 */

/**
 * The three parts a layer with depth is laid in: where the things were drawn, what the effects drew
 * round them (the halo), and the rest.
 *
 * @internal
 */
export type TLayerPart = 'own' | 'near' | 'rest';

/**
 * All of them, in the order they are laid.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LAYER_PARTS: readonly TLayerPart[] = ['own', 'near', 'rest'];

/**
 * What is laid at the layer's own place when its halo waits for later models.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LAYER_PARTS_IN_PLACE: readonly TLayerPart[] = ['own', 'rest'];

/**
 * What is laid later, when the halo waits.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const LAYER_PARTS_LATER: readonly TLayerPart[] = ['near'];
