import type { TColor } from '../../../color';
import type { TTexture } from '../../texture/types/t_texture';
import type { TLoadedAtlas } from '../../atlas/types/t_loaded_atlas';
import type { TSpriteAtlas } from '../../../atlas/types/t_sprite_atlas';
import type { TAnimationClip } from '../../../hooks/animation/types/t_sprite_animation';
import type {
    TChildEmitter, TEmissionDoc, TEmitShape2d, TEmitShape3d, TParticleAnimPace, TParticleBlend, TParticleCollision, TParticleRange,
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
    /**
     * A sheet to take the frames from instead, which wins over `texture`: a path to an `.atlas`, a
     * sheet `useLoadAtlas` gave back, or one cut in code with `createSpriteAtlas`. Frames are drawn
     * on a square, so a long or tall one comes out stretched.
     */
    atlas?: string | TLoadedAtlas | TSpriteAtlas | null;
    /**
     * Which frame of the sheet, by its place or, in a packed sheet, its name. With neither this nor
     * `anim`, the first.
     */
    frame?: number | string | null;
    /**
     * A run every particle plays from its birth: one the sheet names (its `sequences`), or one
     * written here, `{ frames: [0, 1, 2, 3], fps: 12 }`, which is what a sheet cut in code needs,
     * having none of its own. `frame` wins when both are given.
     */
    anim?: string | TAnimationClip | null;
    /**
     * How `anim` is paced: over each particle's life (`'life'`, the default) or at its own `fps`
     * (`'clip'`). See `TParticleAnimPace`.
     */
    animPace?: TParticleAnimPace;
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
    kind: 'particles-2d';
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
    kind: 'particles-3d';
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
