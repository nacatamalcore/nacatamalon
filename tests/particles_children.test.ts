import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { loadParticles } from '../src/loaders/particles/load_particles';
import { newParticlesFile } from '../src/loaders/particles/new_particles_file';
import { simulateParticles } from '../src/gameobjects/particles/simulate_particles';
import { childrenOf } from '../src/gameobjects/particles/particle_state';
import { countParticles as countWebGPU } from '../src/render/webgpu/particles/draw_particles';
import { countParticles as countWebGL2 } from '../src/render/webgl2/particles/draw_particles';
import { createTestGame } from './helpers/test_game';
import { effectDoc, effectState, noTint, somewhere } from './helpers/particles';
import type { TParticlesFile } from '../src/loaders/particles/types/t_particles_file';
import type { TDrawParticles } from '../src/render/interface';

/**
 * Effects set off by another's particles: the sparks a rocket leaves when it dies.
 *
 * Pinned: where the child's file is found, that a file leading back to itself is refused rather than
 * loaded for ever, that a child goes off at the right moment from the right place, and that the
 * draw counts its particles too.
 */

let restore: Array<() => void> = [];
afterEach(() => {
    for (const undo of restore) undo();
    restore = [];
});

/**
 * Serves these files by path, and remembers what was asked for.
 */
const serve = (files: Record<string, unknown>) => {
    const asked: string[] = [];
    const spy = spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => {
        asked.push(url);
        const body = files[url];
        return body === undefined ? { ok: false, status: 404 } : { ok: true, json: async () => body };
    }) as unknown as typeof fetch);
    restore.push(() => spy.mockRestore());
    return asked;
};

const quiet = () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    restore.push(() => warn.mockRestore());
    return warn;
};

/**
 * Waits for every load in flight to settle.
 */
const settle = () => new Promise((done) => setTimeout(done, 10));

describe('loading an effect that sets off others', () => {
    it('finds the child next to the file that names it, through the game\'s cache', async () => {
        const asked = serve({
            '/fx/rocket.particles': { kind: 'particles2d', children: [{ on: 'death', src: 'sparks.particles', count: 3 }] },
            '/fx/sparks.particles': { kind: 'particles2d' },
        });
        const { store } = createTestGame();
        const file = newParticlesFile('/fx/rocket.particles', 'rocket');
        await loadParticles(store, file);
        await settle();

        expect(asked).toEqual(['/fx/rocket.particles', '/fx/sparks.particles']);
        expect(file.children[0]?.status).toBe('ready');
        expect(store.get('assets').particles.get('/fx/sparks.particles')).toBe(file.children[0]!);
    });

    it('refuses a file that leads back to itself, instead of loading for ever', async () => {
        const warn = quiet();
        serve({
            '/a.particles': { kind: 'particles2d', children: [{ on: 'death', src: 'b.particles' }] },
            '/b.particles': { kind: 'particles2d', children: [{ on: 'death', src: 'a.particles' }] },
        });
        const { store } = createTestGame();
        const a = newParticlesFile('/a.particles', '/a.particles');
        store.get('assets').particles.set('/a.particles', a);
        await loadParticles(store, a);
        await settle();

        const b = a.children[0]!;
        expect(b.status).toBe('ready');
        expect(b.children).toEqual([null]);
        expect(String(warn.mock.calls[0]?.[0])).toContain('leads back to itself');
    });
});

/**
 * A rocket file whose particles set off `sparks` when they die, with both documents already here.
 */
const rocketWithSparks = (on: 'birth' | 'death') => {
    const sparks = newParticlesFile('/sparks.particles', 'sparks');
    sparks.doc = effectDoc({ max: 20, life: 5, speed: 0, emission: { rate: 0, burst: 0 } });
    sparks.status = 'ready';
    const rocket = newParticlesFile('/rocket.particles', 'rocket');
    rocket.doc = effectDoc({
        max: 1, life: 0.05, speed: 600, spread: 0, direction: 0,
        emission: { rate: 0, burst: 1, duration: 0, loop: false },
        children: [{ on, src: 'sparks.particles', count: 4 }],
    });
    rocket.children = [sparks];
    rocket.status = 'ready';
    const state = effectState(rocket.doc);
    state.children = childrenOf(rocket);
    const step = () => simulateParticles(state, rocket.doc as never, 1 / 60, somewhere(), true, noTint, 0);
    return { state, step, sparks: () => state.children[0]!.state };
};

describe('an effect set off by another', () => {
    it('goes off when a particle dies, where it died, and outlives it', () => {
        const { state, step, sparks } = rocketWithSparks('death');
        step();
        expect(sparks()?.pool.live ?? 0).toBe(0);

        // Stopped on the very frame it burns out.
        for (let i = 0; i < 10 && state.pool.live > 0; i++) step();

        expect(state.pool.live).toBe(0);
        expect(sparks()!.pool.live).toBe(4);
        // Where the rocket got to before it burnt out, not where it started.
        expect(sparks()!.pool.x[0]!).toBeGreaterThan(10);
        // Drawn this frame, not the next.
        expect(sparks()!.instanceCount).toBe(4);
    });

    it('goes off in the world, from a cloud that rides its emitter', () => {
        const { state, sparks } = rocketWithSparks('birth');
        const doc = { ...effectDoc({
            max: 1, life: 1, speed: 0, worldSpace: false,
            emission: { rate: 0, burst: 1, duration: 0, loop: false },
            children: [{ on: 'birth', src: 'sparks.particles', count: 1 }],
        }) };
        simulateParticles(state, doc, 1 / 60, somewhere({ x: 100, y: 50 }), true, noTint, 0);

        expect(sparks()!.pool.x[0]!).toBeCloseTo(100, 4);
        expect(sparks()!.pool.y[0]!).toBeCloseTo(50, 4);
    });

    it('goes off when a particle is born, from where it was born', () => {
        const { step, sparks } = rocketWithSparks('birth');
        step();

        expect(sparks()!.pool.live).toBe(4);
        expect(sparks()!.pool.x[0]!).toBeCloseTo(0, 5);
    });
});

describe('drawing what an effect set off', () => {
    const cloud = (count: number, children?: TDrawParticles[]): TDrawParticles =>
        ({ type: 'particles', instances: new Float32Array(0), count, texture: null, blend: 'alpha', children });

    it('makes room for the children\'s particles too, however deep, on both backends', () => {
        const drawn = [cloud(0, [cloud(3, [cloud(2)]), cloud(1)])];

        expect(countWebGPU(drawn)).toBe(6);
        expect(countWebGL2(drawn)).toBe(6);
    });
});

describe('a child file for the other dimension', () => {
    it('is left out and said once', () => {
        const warn = quiet();
        const { state, step } = rocketWithSparks('birth');
        const wrong = newParticlesFile('/deep.particles', 'deep') as TParticlesFile;
        wrong.doc = { ...effectDoc(), kind: 'particles3d' } as never;
        state.children[0]!.file = wrong;
        step();
        step();

        expect(state.children[0]!.state).toBeNull();
        expect(warn.mock.calls.filter((call) => String(call[0]).includes('/deep.particles')).length).toBe(1);
    });
});
