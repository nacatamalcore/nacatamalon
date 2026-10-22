import { PHYSICS_LAYERS } from '../CONFIG';

export { PHYSICS_LAYERS };

/**
 * Every layer at once, which is what a collider hits unless a scene says otherwise.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const ALL_LAYERS = (1 << PHYSICS_LAYERS) - 1;
