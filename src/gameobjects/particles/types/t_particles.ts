import type { TColor } from '../../../color';
import type { TParticlesFile } from '../../../loaders/particles/types/t_particles_file';
import type { TTransform2d } from '../../types/t_transform_2d';

/**
 * What a scene may turn up or down about an effect without writing a second file.
 *
 * The file says what the effect **is**, and it is shared: three torches are one document. These are
 * the handful of things one of those torches may disagree with it about.
 *
 * It exists because every game eventually wants "the same explosion, half the size", and making
 * that a second file is what forks an effect into six near-copies nobody can keep in step.
 *
 * @category Particles
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleOverrides = {
    /**
     * Multiplies how many come out a second.
     */
    rateScale?: number;
    /**
     * Multiplies how big they are born.
     */
    sizeScale?: number;
    /**
     * Multiplies how fast they set off.
     */
    speedScale?: number;
    /**
     * Multiplies how long they live.
     */
    lifeScale?: number;
};

/**
 * An emitter: a place in the world that makes particles, following an effect written in a file.
 *
 * **Plain data from end to end**, like every other record here. Its living particles, its own stream
 * of chance and the numbers bound for the card are not any of those things, so they are kept beside
 * it rather than in it, and found by it. That is what lets an emitter be written to a scene file at
 * all: what would be written is what is here, and all of it is JSON.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticles = {
    readonly type: 'particles';
    id: string;
    /**
     * What a warning about it will call it. Defaults to the file it came from.
     */
    name: string;
    /**
     * The effect it follows. Filled in when the file lands; until then it draws nothing.
     */
    file: TParticlesFile;
    /**
     * Where the emitter is. Particles are born here, turned by whatever is above it.
     */
    transform: TTransform2d;
    /**
     * Where it ended up once everything above it has moved it, when something did.
     *
     * Set by the engine every frame and never authored or saved. Ask `worldOf` rather than reading
     * either field by hand. It matters more here than for a sprite: this is the point particles are
     * born at, so reading the wrong one puts a whole cloud in the wrong place.
     */
    worldTransform?: TTransform2d;
    /**
     * Multiplied into every particle, over the colour the effect's own curve gives it.
     */
    tint: TColor;
    /**
     * Multiplied into every particle's opacity, the same way.
     */
    alpha: number;
    /**
     * Crisp or blended. Default: the game's own setting.
     */
    smooth?: boolean;
    /**
     * What this one disagrees with its file about, or nothing.
     */
    overrides?: TParticleOverrides;
    /**
     * Whether new ones are appearing.
     *
     * Turning this off is **not** the same as clearing: the ones already alive go on living and
     * drawing, which is what putting out a torch looks like. Runtime state, and deliberately not
     * what gets written to a file.
     */
    emitting: boolean;
    /**
     * Frozen. Nothing moves and nothing is born, and it keeps drawing exactly what it last drew.
     *
     * Freezing rather than hiding, because the useful half of this is for a host showing the game
     * while somebody works: a still flame is something you can line a box up against, and a hidden
     * one is a hole where you have to remember an effect was.
     */
    paused: boolean;
    /**
     * Whether it starts emitting the moment its file lands.
     *
     * **The authored intention, and the only one of these three that belongs in a file.** A torch a
     * script put out is still a torch that starts lit, and saving the running state would write
     * "out" into the level.
     */
    autoplay: boolean;
    /**
     * The seed for this emitter's own chance, or `null` for one taken from the clock.
     *
     * Set it and the effect replays exactly, which is what a screenshot test and an editor preview
     * want. Leave it and every run looks a little different, which is what a game wants.
     */
    seed: number | null;
    zIndex?: number;
    visible: boolean;
    /**
     * Set by `destroy` and never cleared. True means it is on its way out and nothing should treat
     * it as part of the game any more, even in the gap before the frame sweeps it away.
     */
    destroyed: boolean;
};
