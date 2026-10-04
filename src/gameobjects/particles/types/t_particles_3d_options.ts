import type { TParticlesOptions } from './t_particles_options';
import type { TTransform3d } from '../../types/t_transform_3d';

/**
 * What `createParticles3d` is asked for: the flat emitter's options, placed in three dimensions.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticles3dOptions = Omit<TParticlesOptions, 'transform'> & {
    /**
     * Where it is. Particles are born here, turned and scaled by whatever is above it.
     */
    transform?: Partial<TTransform3d>;
};
