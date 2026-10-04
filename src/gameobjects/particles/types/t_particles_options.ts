import type { TColor } from '../../../color';
import type { TParticleOverrides } from './t_particles';
import type { TParticlesFile } from '../../../loaders/particles/types/t_particles_file';
import type { TTransform2d } from '../../types/t_transform_2d';

/**
 * What `createParticles` is asked for.
 *
 * Almost everything about the effect itself lives in its file, and that is the point: three torches
 * are one document. What is here is the handful of things **this** emitter decides for itself.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesOptions = {
    /**
     * The effect, from `useLoadParticles`, or the name one was loaded under.
     */
    effect: TParticlesFile | string;
    /**
     * What a warning about it will call it. Defaults to the file.
     */
    name?: string;
    /**
     * Where it is. Particles are born here, turned and scaled by whatever is above it.
     */
    transform?: Partial<TTransform2d>;
    /**
     * Multiplied into every particle, over the colour the effect's own curve gives it.
     */
    tint?: TColor;
    /**
     * Multiplied into every particle's opacity, the same way. Default `1`.
     */
    alpha?: number;
    /**
     * Crisp or blended. Default: the game's own setting.
     */
    smooth?: boolean;
    /**
     * What this emitter disagrees with its file about: a smaller explosion, a slower fountain.
     */
    overrides?: TParticleOverrides;
    /**
     * Start as soon as the file lands. `true` by default, because a torch put in a scene should be
     * burning. `false` for something an event fires.
     */
    autoplay?: boolean;
    /**
     * Its own seed, so it replays exactly. Omitted, every run looks a little different.
     */
    seed?: number;
    /**
     * Draw order, as everywhere else.
     */
    zIndex?: number;
    /**
     * Whether it is drawn at all. Default `true`.
     */
    visible?: boolean;
};
