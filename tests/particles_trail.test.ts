import { describe, expect, it } from 'bun:test';
import { simulateParticles } from '../src/gameobjects/particles/simulate_particles';
import { killParticle, takeSlot } from '../src/gameobjects/particles/particle_pool';
import { PARTICLE_FLOATS, PARTICLE_OFFSET } from '../src/render/shared/particle_instance';
import { effectDoc, effectState, noTint, somewhere } from './helpers/particles';
import type { TParticleState } from '../src/gameobjects/particles/types/t_particle_pool';

/**
 * A tail: copies of each particle at its last places, drawn before it, narrower and fainter towards
 * the end. What is pinned is what it keeps, the order it is drawn in, and that it belongs to its
 * particle and to nobody else's.
 */

/**
 * One particle flying right at 60 px/s from the origin, with a tail of four, never another.
 */
const flying = (trail: Record<string, unknown> = { length: 4, width: 0.5, fade: true }) => {
    const doc = effectDoc({
        max: 4, life: 10, speed: 60, spread: 0, direction: 0, size: 8,
        emission: { rate: 0, burst: 1, duration: 0, loop: false }, trail,
    });
    const state = effectState(doc);
    const step = (delta = 1 / 60) => simulateParticles(state, doc, delta, somewhere(), true, noTint, 0);
    return { state, step };
};

/**
 * The instance at `n`, as the card reads it.
 */
const instance = (state: TParticleState, n: number) => {
    const at = n * PARTICLE_FLOATS;
    return {
        x: state.instances[at + PARTICLE_OFFSET.x]!,
        size: state.instances[at + PARTICLE_OFFSET.size]!,
        a: state.instances[at + PARTICLE_OFFSET.a]!,
    };
};

describe('a tail', () => {
    it('keeps the last places, and is drawn before its particle, newest first', () => {
        const { state, step } = flying();
        for (let i = 0; i < 6; i++) step();

        // Four places kept and the particle itself: five quads, the tail first.
        expect(state.instanceCount).toBe(5);
        const head = instance(state, 4);
        const tail = [0, 1, 2, 3].map((n) => instance(state, n).x);
        expect(tail.every((x, n) => n === 0 || x < tail[n - 1]!)).toBe(true);
        expect(tail[0]).toBeLessThanOrEqual(head.x);
    });

    it('narrows towards the end, and with fade gets fainter too', () => {
        const { state, step } = flying();
        for (let i = 0; i < 6; i++) step();

        const head = instance(state, 4);
        const newest = instance(state, 0);
        const oldest = instance(state, 3);
        expect(newest.size).toBeLessThan(head.size);
        expect(oldest.size).toBeLessThan(newest.size);
        expect(oldest.a).toBeLessThan(newest.a);
    });

    it('only narrows without fade', () => {
        const { state, step } = flying({ length: 4, width: 0.5, fade: false });
        for (let i = 0; i < 6; i++) step();

        expect(instance(state, 3).a).toBe(instance(state, 4).a);
    });

    it('keeps a place sixty times a second whatever the frame rate, so its length is a time', () => {
        const slow = flying();
        // Born at the end of the first frame, so the second is the first with somewhere to keep.
        slow.step(1 / 30);
        slow.step(1 / 30);
        // A slower frame is one place, not two at once.
        expect(slow.state.pool.trailFill[0]).toBe(1);

        // And a faster one is not a place every frame: eight frames at 240 are two sixtieths.
        const fast = flying();
        fast.step(1 / 240);
        for (let i = 0; i < 8; i++) fast.step(1 / 240);
        expect(fast.state.pool.trailFill[0]).toBe(2);
    });

    it('starts empty on a slot used again, instead of dragging the last owner\'s streak', () => {
        const { state, step } = flying();
        for (let i = 0; i < 6; i++) step();
        killParticle(state.pool, 0);
        const slot = takeSlot(state.pool);

        expect(slot).toBe(0);
        expect(state.pool.trailFill[0]).toBe(0);
    });

    it('goes with its particle when another one dies and it moves down', () => {
        const { state } = flying();
        const pool = state.pool;
        pool.live = 2;
        pool.trailFill[1] = 2;
        pool.trailHead[1] = 2;
        pool.tx[4] = 11;
        pool.tx[5] = 12;
        killParticle(pool, 0);

        expect(pool.trailFill[0]).toBe(2);
        expect([pool.tx[0], pool.tx[1]]).toEqual([11, 12]);
    });

    it('costs nothing in an effect without one', () => {
        const { state, step } = flying(null as unknown as Record<string, unknown>);
        for (let i = 0; i < 6; i++) step();

        expect(state.instanceCount).toBe(1);
        expect(state.pool.tx.length).toBe(0);
    });
});
