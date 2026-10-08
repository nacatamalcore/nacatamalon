import type { TColor } from '../../../color';
import type { TTexture } from '../../texture/types/t_texture';
import type {
    TChildEmitter, TEmissionDoc, TEmitShape2d, TEmitShape3d, TParticleBlend, TParticleCollision, TParticleRange,
    TParticleScaleStop, TParticlesBounds, TParticleTrail,
} from './t_particles_doc';

/**
 * One stop of the colour curve as it is written: the colour as text (`'#ffcc00'`) or as a colour
 * already worked out (`lerpColor(dusk, night, stage)`), and its opacity, which is the colour's own
 * when left out.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleColorStopInput = { t: number; color: string | TColor; alpha?: number };

/**
 * Everything both dimensions write the same way. Every field can be left out and means what it
 * means in an effect file: the reader fills in the rest.
 */
type TParticlesEffectCommon = {
    /**
     * The picture every particle shows: a path, or a texture made in code, like the one
     * `createPixelTexture` gives back. Left out, a particle is a square of its colour.
     */
    texture?: string | TTexture | null;
    max?: number;
    blend?: TParticleBlend;
    worldSpace?: boolean;
    emission?: Partial<TEmissionDoc>;
    spread?: number;
    /**
     * A number, or the shortest and the longest as a pair, picked between at random per particle.
     * The same for the three after it.
     */
    life?: number | TParticleRange;
    speed?: number | TParticleRange;
    size?: number | TParticleRange;
    spin?: number | TParticleRange;
    damping?: number;
    colorOverLife?: TParticleColorStopInput[];
    sizeOverLife?: TParticleScaleStop[];
    collision?: Partial<TParticleCollision> | null;
    trail?: Partial<TParticleTrail> | null;
    bounds?: TParticlesBounds | null;
    /**
     * Effects it sets off, by the path of their file.
     */
    children?: Array<Omit<TChildEmitter, 'count'> & { count?: number }>;
};

/**
 * A flat effect written in code instead of in a `.particles` file: the same fields, the same
 * meaning, and only `kind` has to be said. For an effect that depends on the game, like dust the
 * colour of the ground the car is on.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesEffect2d = TParticlesEffectCommon & {
    kind: 'particles2d';
    shape?: TEmitShape2d;
    direction?: number;
    gravity?: { x?: number; y?: number };
};

/**
 * The same, for an effect in three dimensions.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesEffect3d = TParticlesEffectCommon & {
    kind: 'particles3d';
    shape?: TEmitShape3d;
    direction?: { x: number; y: number; z: number };
    gravity?: { x?: number; y?: number; z?: number };
};

/**
 * Either of the two.
 *
 * @category Assets & loading
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlesEffect = TParticlesEffect2d | TParticlesEffect3d;
