import { describe, expect, it } from 'bun:test';
import { effectDoc, effectState, noTint, somewhere } from './helpers/particles';
import { PARTICLE_FLOATS, PARTICLE_OFFSET } from '../src/render/shared/particle_instance';
import { simulateParticles } from '../src/gameobjects/particles/simulate_particles';
import type { TParticlesDoc2d } from '../src/loaders/particles/types/t_particles_doc';
import type { TParticleState } from '../src/gameobjects/particles/types/t_particle_pool';

/**
 * What a step of the simulation does.
 *
 * All of it without a browser, a card or a scene, which is what being a function of what it is
 * given buys: every property below is a property of the effect and not of the machine.
 */

const FRAME = 1 / 60;

/**
 * Runs `seconds` of frames, so a test says what it means rather than counting steps.
 */
const run = (state: TParticleState, doc: TParticlesDoc2d, seconds: number, at = somewhere(), emitting = true): void => {
    for (let i = 0; i < Math.round(seconds / FRAME); i++) {
        simulateParticles(state, doc, FRAME, at, emitting, noTint, 0);
    }
};

describe('how many come out', () => {
    it('emits its rate over a second, give or take the frame it is cut into', () => {
        const doc = effectDoc({ emission: { rate: 60, burst: 0, duration: 0, loop: true }, life: 10 });
        const state = effectState(doc);

        run(state, doc, 1);

        expect(state.pool.live).toBeGreaterThanOrEqual(59);
        expect(state.pool.live).toBeLessThanOrEqual(61);
    });

    it('carries the fraction of a particle between frames, which is the ordinary case', () => {
        // Half a particle per frame at sixty frames a second. Without the carry this is a rate that
        // rounds to nothing and an emitter that never emits.
        const doc = effectDoc({ emission: { rate: 30, burst: 0, duration: 0, loop: true }, life: 10 });
        const state = effectState(doc);

        run(state, doc, 1);

        expect(state.pool.live).toBeGreaterThanOrEqual(29);
        expect(state.pool.live).toBeLessThanOrEqual(31);
    });

    it('never goes past what the effect asked room for', () => {
        const doc = effectDoc({ max: 50, emission: { rate: 100000, burst: 0, duration: 0, loop: true }, life: 10 });
        const state = effectState(doc);

        run(state, doc, 1);

        expect(state.pool.live).toBe(50);
    });

    it('fires a burst once when the cycle starts, and not again while it runs', () => {
        const doc = effectDoc({ emission: { rate: 0, burst: 12, duration: 0, loop: true }, life: 10 });
        const state = effectState(doc);

        simulateParticles(state, doc, FRAME, somewhere(), true, noTint, 0);
        expect(state.pool.live).toBe(12);

        run(state, doc, 0.5);
        expect(state.pool.live).toBe(12);
    });

    it('stops at the end of a cycle that does not loop', () => {
        const doc = effectDoc({ emission: { rate: 60, burst: 0, duration: 0.25, loop: false }, life: 10 });
        const state = effectState(doc);

        run(state, doc, 1);

        // A quarter of a second of a rate of sixty, and then nothing however long it runs for.
        expect(state.pool.live).toBeGreaterThanOrEqual(14);
        expect(state.pool.live).toBeLessThanOrEqual(16);
    });

    it('emits nothing at all when it has been told to stop, and lets the living finish', () => {
        const doc = effectDoc({ emission: { rate: 60, burst: 0, duration: 0, loop: true }, life: 0.5 });
        const state = effectState(doc);

        run(state, doc, 0.2);
        const alive = state.pool.live;
        expect(alive).toBeGreaterThan(0);

        // Stopping is not clearing: what is already in the air stays in the air.
        run(state, doc, 0.05, somewhere(), false);
        expect(state.pool.live).toBe(alive);

        run(state, doc, 1, somewhere(), false);
        expect(state.pool.live).toBe(0);
    });
});

describe('where they go', () => {
    it('is born at the emitter and travels its speed over time', () => {
        const doc = effectDoc({
            emission: { rate: 0, burst: 1, duration: 0, loop: false },
            shape: { kind: 'point' }, direction: 0, spread: 0,
            speed: 100, size: 4, life: 10, damping: 0,
        });
        const state = effectState(doc);

        simulateParticles(state, doc, FRAME, somewhere({ x: 50, y: 20 }), true, noTint, 0);

        // Exactly at the emitter, with no travel yet. That is what emitting AFTER the move buys,
        // and it is what makes a fast emitter look attached to whatever is carrying it instead of
        // trailing a frame's gap behind it.
        expect(state.pool.x[0]!).toBe(50);
        expect(state.pool.y[0]!).toBe(20);

        // And from the next frame on it travels at its speed.
        run(state, doc, 0.5, somewhere({ x: 50, y: 20 }), false);
        expect(state.pool.x[0]!).toBeCloseTo(50 + 100 * 0.5, 1);
    });

    it('is pulled by gravity, and downwards means a growing y', () => {
        const doc = effectDoc({
            emission: { rate: 0, burst: 1, duration: 0, loop: false },
            shape: { kind: 'point' }, direction: 0, spread: 0, speed: 0,
            gravity: { x: 0, y: 100 }, life: 10, damping: 0,
        });
        const state = effectState(doc);

        run(state, doc, 1);

        expect(state.pool.y[0]!).toBeGreaterThan(0);
    });

    it('is stopped by a huge damping rather than sent backwards', () => {
        const doc = effectDoc({
            emission: { rate: 0, burst: 1, duration: 0, loop: false },
            shape: { kind: 'point' }, direction: 0, spread: 0, speed: 100,
            damping: 10000, life: 10,
        });
        const state = effectState(doc);

        run(state, doc, 0.5);

        // A drag bigger than one over the frame time would reverse it if it were not held at zero,
        // and a cloud that turns inside out is a strange thing to debug.
        expect(state.pool.vx[0]!).toBe(0);
        expect(state.pool.x[0]!).toBeGreaterThanOrEqual(0);
    });

    it('takes the emitter\'s own turn into account, so a turned emitter sprays the other way', () => {
        const doc = effectDoc({
            emission: { rate: 0, burst: 1, duration: 0, loop: false },
            shape: { kind: 'point' }, direction: 0, spread: 0, speed: 100, life: 10, damping: 0,
        });
        const state = effectState(doc);

        run(state, doc, 0.5, somewhere({ rotation: Math.PI }));

        expect(state.pool.x[0]!).toBeLessThan(0);
    });
});

describe('the same effect twice', () => {
    it('gives the same cloud for the same seed, which is what a screenshot test rests on', () => {
        const doc = effectDoc({ emission: { rate: 120, burst: 0, duration: 0, loop: true }, life: 2 });
        const cloud = (seed: number) => {
            const state = effectState(doc, seed);
            run(state, doc, 0.5);
            return Array.from(state.pool.x.slice(0, state.pool.live));
        };

        expect(cloud(7)).toEqual(cloud(7));
        expect(cloud(7)).not.toEqual(cloud(8));
    });
});

describe('what the card is handed', () => {
    it('packs one run of numbers per living particle, and says how many', () => {
        const doc = effectDoc({ emission: { rate: 0, burst: 5, duration: 0, loop: false }, life: 10 });
        const state = effectState(doc);

        simulateParticles(state, doc, FRAME, somewhere({ x: 10, y: 10 }), true, noTint, 3);

        expect(state.instanceCount).toBe(5);
        for (let i = 0; i < 5; i++) {
            const at = i * PARTICLE_FLOATS;
            expect(state.instances[at + PARTICLE_OFFSET.size]!).toBeGreaterThan(0);
            // Every particle of an emitter is seen through the same view: it is one object.
            expect(state.instances[at + PARTICLE_OFFSET.view]!).toBe(3);
        }
    });

    it('walks the colour curve as a particle ages', () => {
        const doc = effectDoc({
            emission: { rate: 0, burst: 1, duration: 0, loop: false },
            life: 1,
            colorOverLife: [{ t: 0, color: '#ffffff', alpha: 1 }, { t: 1, color: '#000000', alpha: 0 }],
        });
        const state = effectState(doc);

        simulateParticles(state, doc, FRAME, somewhere(), true, noTint, 0);
        const young = state.instances[PARTICLE_OFFSET.r]!;

        run(state, doc, 0.6, somewhere(), false);
        const old = state.instances[PARTICLE_OFFSET.r]!;

        expect(young).toBeGreaterThan(0.9);
        expect(old).toBeLessThan(young);
    });

    it('lays the emitter\'s own colour over whatever the curve said', () => {
        const doc = effectDoc({
            emission: { rate: 0, burst: 1, duration: 0, loop: false },
            life: 10,
            colorOverLife: [{ t: 0, color: '#ffffff', alpha: 1 }],
        });
        const state = effectState(doc);

        simulateParticles(state, doc, FRAME, somewhere(), true, { r: 1, g: 0.5, b: 0, a: 0.5 }, 0);

        expect(state.instances[PARTICLE_OFFSET.r]!).toBeCloseTo(1, 5);
        expect(state.instances[PARTICLE_OFFSET.g]!).toBeCloseTo(0.5, 5);
        expect(state.instances[PARTICLE_OFFSET.b]!).toBeCloseTo(0, 5);
        expect(state.instances[PARTICLE_OFFSET.a]!).toBeCloseTo(0.5, 5);
    });
});
