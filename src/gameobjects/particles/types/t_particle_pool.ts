import type { TRandomHandle } from '../../../math/random';
import type { TParticlesFile } from '../../../loaders/particles/types/t_particles_file';

/**
 * The live particles of one emitter, as parallel arrays rather than as objects.
 *
 * Arrays of each field and not an array of particles, because of what this is for: hundreds of them
 * per emitter, rewritten sixty times a second, is exactly where one object each starts showing up in
 * a profile, and every one of those objects would be rubbish to collect a second later.
 *
 * The arrays are asked for **once**, at `capacity`, and never grow. An emitter that is full drops
 * the births it cannot fit, so the cost of an effect is a number its author chose rather than one
 * the frame rate discovers.
 *
 * `live` is the **living prefix**: everything from `0` to `live` is alive and everything above is
 * free space still holding whatever last used it. A death swaps the dead slot with the last living
 * one and counts down, so the prefix stays in one piece and going to the card is one `subarray` with
 * no tidying pass.
 *
 * The price of that trick has to be said out loud: **a particle has no fixed index**, and nothing
 * may hold on to one from one frame to the next.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticlePool = {
    capacity: number;
    live: number;
    x: Float32Array;
    y: Float32Array;
    /**
     * The third axis. Only an effect in three dimensions writes it; a flat one leaves it at zero.
     */
    z: Float32Array;
    vx: Float32Array;
    vy: Float32Array;
    vz: Float32Array;
    /**
     * Seconds lived so far, and how many it gets. Their ratio is where it is on every curve.
     */
    age: Float32Array;
    life: Float32Array;
    /**
     * The size it was born at, in pixels, before the curve multiplies it.
     */
    size: Float32Array;
    /**
     * Radians a second, and where it has turned to so far.
     */
    spin: Float32Array;
    rotation: Float32Array;
    /**
     * How many of its last places each particle keeps for its tail, `0` for an effect with none.
     */
    trailLength: number;
    /**
     * Those places, `trailLength` of them per particle, one after another: a ring each, written over
     * from `trailHead` on. Asked for once with everything else, and empty for an effect with no tail.
     */
    tx: Float32Array;
    ty: Float32Array;
    tz: Float32Array;
    /**
     * Where each particle's ring is written next.
     */
    trailHead: Uint16Array;
    /**
     * How many places each particle's ring holds so far, up to `trailLength`.
     */
    trailFill: Uint16Array;
};

/**
 * Everything one emitter owns that is not plain data, kept apart from its record.
 *
 * A record in this engine is JSON and nothing else, so it may not hold typed arrays, a function or a
 * buffer bound for the card. This is where those live, found by the record rather than stored in it,
 * which is the same arrangement a sprite's owner already uses.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TParticleState = {
    pool: TParticlePool;
    /**
     * This emitter's own stream of chance.
     *
     * Its own, rather than the game's, because emitting would otherwise take draws from the shared
     * one: lighting a torch would shift every other seeded decision in the game, and a run would
     * stop replaying.
     */
    random: TRandomHandle;
    /**
     * Seconds into the current cycle, which is what decides when a burst re-arms and a loop turns over.
     */
    cycleTime: number;
    /**
     * The fraction of a particle left over from last frame.
     *
     * At sixty frames a second a rate of thirty asks for half a particle per frame, which is the
     * ordinary case and not an edge one. Without this, every rate below sixty would round to
     * nothing and no slow emitter would ever emit.
     */
    carry: number;
    /**
     * Seconds since the tail last kept a place. A tail keeps one sixty times a second whatever the
     * frame rate, so its length is a length of time its author chose, the same on every machine.
     */
    trailClock: number;
    /**
     * The effects this one's particles set off, each with particles of its own once its file is here.
     * Owned by this emitter, so two torches that throw sparks throw two sets of them.
     */
    children: TChildParticles[];
    /**
     * The colour at each of a fixed number of steps through a life, worked out once when the file lands.
     */
    colorTable: Float32Array;
    /**
     * The size multiplier at those same steps.
     */
    scaleTable: Float32Array;
    /**
     * Births asked for by the game that have not happened yet.
     *
     * Asked for and not done on the spot, because the game fires one of these from an update and a
     * particle has to be born **where the emitter ends up**, which is not known until the tree has
     * been walked later in the same frame. Doing it immediately would read where the emitter was
     * last frame, so sparks fired at a point the player just clicked would appear at the point they
     * clicked before that.
     *
     * Nothing is drawn between the two moments, so the wait cannot be seen.
     */
    pending: number;
    /**
     * What the card reads: one run of numbers per living particle.
     */
    instances: Float32Array;
    instanceCount: number;
};

/**
 * One effect another one's particles set off: when, how many each time, its file, and its particles,
 * which are `null` until the file is here.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TChildParticles = {
    on: 'birth' | 'death';
    count: number;
    file: TParticlesFile;
    state: TParticleState | null;
};
