import { describe, expect, it } from 'bun:test';
import { createParticlePool, killParticle, takeSlot } from '../src/gameobjects/particles/particle_pool';

/**
 * How an emitter holds its particles, which is the decision everything else rests on.
 *
 * Parallel arrays of a fixed size, a living prefix, and a death that swaps rather than leaves a
 * hole. If the prefix ever stops being contiguous, everything downstream is reading rubbish and
 * nothing says so.
 */

/**
 * Fills a pool and marks each particle with its birth order, so a swap can be traced.
 */
const filled = (capacity: number, count: number) => {
    const pool = createParticlePool(capacity);
    for (let i = 0; i < count; i++) {
        const slot = takeSlot(pool);
        pool.x[slot] = i;
    }
    return pool;
};

/**
 * Which particles are alive, by the mark they were given.
 */
const living = (pool: ReturnType<typeof createParticlePool>): number[] =>
    Array.from(pool.x.slice(0, pool.live));

describe('the pool', () => {
    it('hands out slots in order until it is full, and then hands out nothing', () => {
        const pool = createParticlePool(3);

        expect([takeSlot(pool), takeSlot(pool), takeSlot(pool)]).toEqual([0, 1, 2]);
        // Full means the birth is dropped, never that the arrays grow: the cost of an effect is a
        // number its author chose.
        expect(takeSlot(pool)).toBe(-1);
        expect(pool.live).toBe(3);
    });

    it('never grows its arrays, whatever is asked of it', () => {
        const pool = createParticlePool(4);
        for (let i = 0; i < 100; i++) {
            takeSlot(pool);
        }

        expect(pool.x).toHaveLength(4);
        expect(pool.live).toBe(4);
    });

    it('fills the hole a death leaves with the last living one', () => {
        const pool = filled(5, 5);

        killParticle(pool, 1);

        // The one that was last took the dead one's place, and the prefix is still whole.
        expect(pool.live).toBe(4);
        expect(living(pool)).toEqual([0, 4, 2, 3]);
    });

    it('costs nothing when the one that dies is already the last', () => {
        const pool = filled(5, 3);

        killParticle(pool, 2);

        expect(living(pool)).toEqual([0, 1]);
    });

    it('loses none and repeats none when the first and the last die in one pass', () => {
        const pool = filled(5, 5);

        // Backwards, which is the order the simulation kills in and the reason it does: forwards
        // would step straight over whatever was moved into the slot just vacated.
        for (let i = pool.live - 1; i >= 0; i--) {
            if (pool.x[i] === 0 || pool.x[i] === 4) {
                killParticle(pool, i);
            }
        }

        expect(pool.live).toBe(3);
        expect(living(pool).sort()).toEqual([1, 2, 3]);
    });

    it('empties cleanly when every one of them dies', () => {
        const pool = filled(4, 4);
        for (let i = pool.live - 1; i >= 0; i--) {
            killParticle(pool, i);
        }

        expect(pool.live).toBe(0);
        expect(living(pool)).toEqual([]);
        // And it can be used again straight away, because nothing was left in a strange state.
        expect(takeSlot(pool)).toBe(0);
    });
});
