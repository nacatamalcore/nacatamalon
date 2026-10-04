import type { TParticles } from './t_particles';
import type { TTransform3d } from '../../types/t_transform_3d';

/**
 * An emitter in three dimensions: particles in world units, drawn as squares that always face the
 * camera.
 *
 * Everything but its placement is the flat emitter's, field for field, and means the same thing:
 * the same file on the same terms, the same tint, the same verbs. What it does not share is **where
 * it is**, which here is a place in space with a turn of three angles, and the answer to where it
 * ended up is a matrix rather than a flat placement, exactly as it is for a model.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticles3d = Omit<TParticles, 'type' | 'transform' | 'worldTransform'> & {
    readonly type: 'particles3d';
    /**
     * Where the emitter is on its box. Particles are born here, turned and scaled by everything above it.
     */
    transform: TTransform3d;
    /**
     * Where it ended up once everything above it has moved it. Set by the engine each frame; never authored.
     */
    worldMatrix?: Float32Array;
};
