import { bakeColorCurve, bakeScaleCurve } from './bake_curves';
import { createRandom } from '../../math/random';
import { PARTICLE_FLOATS } from '../../render/shared/particle_instance';
import type { TParticlePool, TParticleState } from './types/t_particle_pool';
import type { TParticlesDoc } from '../../loaders/particles/types/t_particles_doc';

/**
 * How often a tail keeps a place, in seconds: sixty times a second whatever the frame rate, so a
 * tail's length is a length of time its author chose and not one each machine decides.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const TRAIL_SAMPLE_SECONDS = 1 / 60;

/**
 * Makes the arrays one emitter lives in, at the size its effect asked for, once.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createParticlePool = (capacity: number, trailLength = 0): TParticlePool => ({
    capacity,
    live: 0,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    vz: new Float32Array(capacity),
    age: new Float32Array(capacity),
    life: new Float32Array(capacity),
    size: new Float32Array(capacity),
    spin: new Float32Array(capacity),
    rotation: new Float32Array(capacity),
    trailLength,
    tx: new Float32Array(capacity * trailLength),
    ty: new Float32Array(capacity * trailLength),
    tz: new Float32Array(capacity * trailLength),
    trailHead: new Uint16Array(trailLength > 0 ? capacity : 0),
    trailFill: new Uint16Array(trailLength > 0 ? capacity : 0),
});

/**
 * Takes a free slot, or `-1` when there is none.
 *
 * **A full emitter drops the birth**, and that is the design rather than a shortfall: it is what
 * makes the cost of an effect a number its author wrote down. Growing instead would mean an effect
 * that is cheap on the machine it was made on and finds its real price on somebody else's.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const takeSlot = (pool: TParticlePool): number => {
    if (pool.live >= pool.capacity) {
        return -1;
    }
    const slot = pool.live++;
    // A slot used again starts with an empty tail. Otherwise a new particle would drag a streak from
    // wherever the last one died, which is the one thing about a tail that reads as a bug.
    if (pool.trailLength > 0) {
        pool.trailHead[slot] = 0;
        pool.trailFill[slot] = 0;
    }
    return slot;
};

/**
 * Kills the particle at `index` by moving the last living one into its place.
 *
 * No hole is left and nothing is tidied up afterwards, so the living stay in one piece and going to
 * the card is a single run of numbers. What it costs is that **a particle has no fixed index**:
 * anything that remembered one across this call would now be looking at a different particle.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const killParticle = (pool: TParticlePool, index: number): void => {
    const last = pool.live - 1;
    if (index !== last) {
        pool.x[index] = pool.x[last]!;
        pool.y[index] = pool.y[last]!;
        pool.z[index] = pool.z[last]!;
        pool.vx[index] = pool.vx[last]!;
        pool.vy[index] = pool.vy[last]!;
        pool.vz[index] = pool.vz[last]!;
        pool.age[index] = pool.age[last]!;
        pool.life[index] = pool.life[last]!;
        pool.size[index] = pool.size[last]!;
        pool.spin[index] = pool.spin[last]!;
        pool.rotation[index] = pool.rotation[last]!;
        // Its tail goes with it.
        const length = pool.trailLength;
        if (length > 0) {
            pool.tx.copyWithin(index * length, last * length, (last + 1) * length);
            pool.ty.copyWithin(index * length, last * length, (last + 1) * length);
            pool.tz.copyWithin(index * length, last * length, (last + 1) * length);
            pool.trailHead[index] = pool.trailHead[last]!;
            pool.trailFill[index] = pool.trailFill[last]!;
        }
    }
    pool.live = last;
};

/**
 * Everything one emitter owns beyond its own record, built the moment its file lands.
 *
 * Not before: until the document is here nobody knows how many particles to make room for, and
 * guessing would mean either a wasted allocation or a second one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createParticleState = (doc: TParticlesDoc, seed: number | null): TParticleState => ({
    pool: createParticlePool(doc.max, doc.trail?.length ?? 0),
    random: createRandom(seed ?? undefined),
    cycleTime: 0,
    carry: 0,
    pending: 0,
    colorTable: bakeColorCurve(doc.colorOverLife),
    scaleTable: bakeScaleCurve(doc.sizeOverLife),
    // Each particle and every place of its tail is drawn as one more of the same quad.
    instances: new Float32Array(doc.max * (1 + (doc.trail?.length ?? 0)) * PARTICLE_FLOATS),
    trailClock: 0,
    children: [],
    instanceCount: 0,
});
