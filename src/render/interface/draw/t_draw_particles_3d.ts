import type { TDrawParticles } from './t_draw_particles';

/**
 * One emitter's particles in three dimensions, as a backend draws them: squares that face the camera.
 *
 * The flat one's fields, with the run of numbers laid out as `PARTICLE_3D_OFFSET` says. Which camera
 * they are seen through is not on it, because that is the scene's: it travels in the pass's
 * `viewIndex`, beside it, exactly as a model's does.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawParticles3d = Omit<TDrawParticles, 'type' | 'children'> & {
    readonly type: 'particles3d';
    /**
     * The effects its particles set off, in depth like it. See `TDrawParticles.children`.
     */
    readonly children?: readonly TDrawParticles3d[];
};
