import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { loadParticles, MAX_CHILD_DEPTH } from '../src/loaders/particles/load_particles';
import { newParticlesFile } from '../src/loaders/particles/new_particles_file';
import { fileFromEffect } from '../src/loaders/particles/file_from_effect';
import { createParticles } from '../src/gameobjects/particles';
import { applyParticlesDoc } from '../src/gameobjects/particles/tools/apply_particles_doc';
import { createScene } from '../src/scene/create_scene';
import { createGameHandle } from '../src/game/handle';
import { simulateParticles } from '../src/gameobjects/particles/simulate_particles';
import { childrenOf, particleStateOf } from '../src/gameobjects/particles/particle_state';
import { countDrawn } from '../src/render/shared/count_drawn';
import { createTestGame, startTestScene } from './helpers/test_game';
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
            '/fx/rocket.particles': { kind: 'particles-2d', children: [{ on: 'death', src: 'sparks.particles', count: 3 }] },
            '/fx/sparks.particles': { kind: 'particles-2d' },
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
            '/a.particles': { kind: 'particles-2d', children: [{ on: 'death', src: 'b.particles' }] },
            '/b.particles': { kind: 'particles-2d', children: [{ on: 'death', src: 'a.particles' }] },
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

    it('refuses the ring when the two files are loaded apart, whichever arrives second closing it', async () => {
        const warn = quiet();
        serve({
            '/a.particles': { kind: 'particles-2d', children: [{ on: 'death', src: '/b.particles' }] },
            '/b.particles': { kind: 'particles-2d', children: [{ on: 'death', src: '/a.particles' }] },
        });
        const { store } = createTestGame();
        const { particles } = store.get('assets');
        const a = newParticlesFile('/a.particles', '/a.particles');
        const b = newParticlesFile('/b.particles', '/b.particles');
        particles.set('/a.particles', a);
        particles.set('/b.particles', b);
        await Promise.all([loadParticles(store, a), loadParticles(store, b)]);
        await settle();

        // One link stands and the other, the one that would close the ring, is left out.
        expect([a.children[0], b.children[0]].filter((child) => child === null)).toHaveLength(1);
        expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('leads back to itself'))).toBe(true);
    });

    it('cuts a ring of three exactly once, in whatever order its files land', async () => {
        const paths = ['/a.particles', '/b.particles', '/c.particles'];
        const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
        for (const order of orders) {
            const warn = quiet();
            serve({
                '/a.particles': { kind: 'particles-2d', children: [{ on: 'death', src: '/b.particles' }] },
                '/b.particles': { kind: 'particles-2d', children: [{ on: 'death', src: '/c.particles' }] },
                '/c.particles': { kind: 'particles-2d', children: [{ on: 'death', src: '/a.particles' }] },
            });
            const { store } = createTestGame();
            const { particles } = store.get('assets');
            const files = paths.map((path) => {
                const file = newParticlesFile(path, path);
                particles.set(path, file);
                return file;
            });
            for (const at of order) {
                await loadParticles(store, files[at]!);
            }
            await settle();

            expect(files.flatMap((file) => file.children).filter((child) => child === null), order.join()).toHaveLength(1);
            expect(warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes('leads back to itself')), order.join()).toHaveLength(1);
            warn.mockClear();
        }
    });

    it('loads a chain longer than particles reach, the same whichever of its files is asked for first', async () => {
        const warn = quiet();
        const name = (level: number) => `/${level}.particles`;
        serve(Object.fromEntries([0, 1, 2, 3, 4, 5].map((level) => [name(level), {
            kind: 'particles-2d',
            ...(level < 5 ? { children: [{ on: 'death', src: name(level + 1) }] } : {}),
        }])));
        const { store } = createTestGame();
        const first = newParticlesFile(name(0), name(0));
        store.get('assets').particles.set(name(0), first);
        await loadParticles(store, first);
        await settle();

        // What is deep from this one may be the first effect of another: particles stop when they run.
        let last = first;
        for (let level = 1; level <= 5; level++) {
            last = last.children[0]!;
            expect(last.src).toBe(name(level));
            expect(last.status).toBe('ready');
        }
        expect(warn).not.toHaveBeenCalled();
    });

    it('stops fetching what keeps growing on a server that answers any path, however it branches', async () => {
        for (const children of [
            [{ on: 'death', src: 'sub/a.particles' }],
            [{ on: 'death', src: 'a/x.particles' }, { on: 'death', src: 'b/x.particles' }],
        ]) {
            const warn = quiet();
            let asked = 0;
            const spy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
                asked += 1;
                return { ok: true, json: async () => ({ kind: 'particles-2d', children }) };
            }) as unknown as typeof fetch);
            restore.push(() => spy.mockRestore());
            const { store } = createTestGame();
            const first = newParticlesFile('/fx/a.particles', '/fx/a.particles');
            store.get('assets').particles.set(first.key, first);
            await loadParticles(store, first);
            await new Promise((done) => setTimeout(done, 120));

            // The first, and what it may have fetched below it.
            expect(asked).toBe(257);
            expect(warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes('files fetched below'))).toHaveLength(1);
            warn.mockClear();
        }
    });

    it('refuses a file that names itself, however the page wrote its path', async () => {
        const warn = quiet();
        serve({ './fx/a.particles': { kind: 'particles-2d', children: [{ on: 'death', src: 'a.particles' }] } });
        const { store } = createTestGame();
        const a = newParticlesFile('./fx/a.particles', './fx/a.particles');
        store.get('assets').particles.set('./fx/a.particles', a);
        await loadParticles(store, a);
        await settle();

        expect(a.children).toEqual([null]);
        expect(String(warn.mock.calls[0]?.[0])).toContain('leads back to itself');
    });

    it('lets two effects set off the same one: that is no ring', async () => {
        const warn = quiet();
        serve({
            '/a.particles': { kind: 'particles-2d', children: [{ on: 'death', src: '/b.particles' }, { on: 'death', src: '/c.particles' }] },
            '/b.particles': { kind: 'particles-2d', children: [{ on: 'death', src: '/c.particles' }] },
            '/c.particles': { kind: 'particles-2d' },
        });
        const { store } = createTestGame();
        const a = newParticlesFile('/a.particles', '/a.particles');
        store.get('assets').particles.set('/a.particles', a);
        await loadParticles(store, a);
        await settle();

        const [b, c] = a.children;
        expect(b!.children).toEqual([c]);
        expect(warn).not.toHaveBeenCalled();
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

/**
 * A document whose one particle sets off its child as it is born, at every step it is given.
 */
const rocketDoc = () => effectDoc({
    max: 8, life: 5, speed: 0,
    emission: { rate: 0, burst: 2, duration: 0, loop: false },
    children: [{ on: 'birth', src: 'sparks.particles', count: 1 }],
});

describe('editing a running effect', () => {
    /**
     * Two emitters on one file that names the same child twice, both already running.
     */
    const running = () => {
        const { store } = createTestGame();
        const named = newParticlesFile('/fx/c.particles', 'c');
        named.doc = effectDoc({ max: 4 });
        named.status = 'ready';
        const effect = { kind: 'particles-2d', max: 4 } as never;
        const emitters: Array<ReturnType<typeof createParticles>> = [];
        startTestScene(store, 'S', () => {
            emitters.push(createParticles({ effect }), createParticles({ effect }));
            return createScene();
        });
        const { file } = emitters[0]!;
        file.children = [named, named];
        file.doc = { ...file.doc!, children: [{ on: 'birth', src: '/fx/c.particles', count: 1 }, { on: 'death', src: '/fx/c.particles', count: 1 }] } as never;
        for (const emitter of emitters) {
            const state = particleStateOf(emitter)!;
            state.children = childrenOf(file).map((child) => ({ ...child, state: effectState(named.doc!) }));
        }
        return { emitters, file, named };
    };

    it('keeps each run of a file named twice to itself', () => {
        const { emitters, file } = running();
        const [first, second] = particleStateOf(emitters[0]!)!.children.map((child) => child.state);

        applyParticlesDoc(emitters[0]!, { ...file.doc!, speed: 3 } as never);

        const after = particleStateOf(emitters[0]!)!.children.map((child) => child.state);
        expect(after[0]).toBe(first!);
        expect(after[1]).toBe(second!);
        expect(after[0]).not.toBe(after[1]!);
    });

    it('changes every emitter following it, not only the one it was given', () => {
        const { emitters, file } = running();

        applyParticlesDoc(emitters[0]!, { ...file.doc!, children: [] } as never);

        expect(file.children).toEqual([]);
        expect(particleStateOf(emitters[1]!)!.children).toEqual([]);
    });

    it('keeps a child however the new version writes its path', () => {
        const { emitters, file, named } = running();
        // Next to the child, so the two ways of writing it are the same file.
        file.src = '/fx/parent.particles';
        const written = file.doc!.children.map((child) => ({ ...child, src: './c.particles' }));

        applyParticlesDoc(emitters[0]!, { ...file.doc!, children: written } as never);

        expect(file.children).toEqual([named, named]);
    });
});

describe('an effect written in code that sets off a file', () => {
    it('asks for it afresh when used again after it was let go of', async () => {
        serve({ '/c.particles': { kind: 'particles-2d' } });
        const { store } = createTestGame();
        const effect = { kind: 'particles-2d', children: [{ on: 'death', src: '/c.particles' }] } as never;
        const file = fileFromEffect(store, effect);
        await settle();
        const first = file.children[0]!;
        createGameHandle(store).releaseAsset(first);
        expect(first.status).toBe('released');

        expect(fileFromEffect(store, effect)).toBe(file);
        await settle();

        expect(file.children[0]).not.toBe(first);
        expect(file.children[0]!.status).toBe('ready');
    });
});

describe('a game that lets an effect go and asks for it again, level after level', () => {
    it('never runs out of asking', async () => {
        const warn = quiet();
        serve({ '/c.particles': { kind: 'particles-2d' } });
        const { store } = createTestGame();
        const effect = { kind: 'particles-2d', children: [{ on: 'death', src: '/c.particles' }] } as never;
        const game = createGameHandle(store);

        for (let level = 0; level < 300; level++) {
            const child = fileFromEffect(store, effect).children[0];
            expect(child, `level ${level}`).not.toBeNull();
            game.releaseAsset(child!);
        }

        expect(warn).not.toHaveBeenCalled();
    });
});

describe('a chain of effects set off at birth', () => {
    /**
     * Files of `levels` effects, each setting off the next as its particles are born.
     */
    const chain = (levels: number) => {
        const files = Array.from({ length: levels }, (_, level) => {
            const file = newParticlesFile(`/${level}.particles`, String(level));
            file.doc = effectDoc({
                max: 8, life: 5, speed: 0,
                emission: { rate: 0, burst: level === 0 ? 1 : 0, duration: 0, loop: false },
                children: level < levels - 1 ? [{ on: 'birth', src: `/${level + 1}.particles`, count: 2 }] : [],
            });
            file.status = 'ready';
            return file;
        });
        files.forEach((file, level) => { file.children = level < levels - 1 ? [files[level + 1]!] : []; });
        const state = effectState(files[0]!.doc!);
        state.children = childrenOf(files[0]!);
        return { state, doc: files[0]!.doc! };
    };

    /**
     * How many live particles each level down has, through the first child at each.
     */
    const liveDown = (state: ReturnType<typeof effectState>): number[] => {
        const live: number[] = [state.pool.live];
        let at = state.children[0]?.state ?? null;
        while (at !== null) {
            live.push(at.pool.live);
            at = at.children[0]?.state ?? null;
        }
        return live;
    };

    it('goes off all the way down: a particle born of a set-off sets off its own', () => {
        const warn = quiet();
        const { state, doc } = chain(4);
        simulateParticles(state, doc as never, 1 / 60, somewhere(), true, noTint, 0);

        expect(liveDown(state)).toEqual([1, 2, 4, 8]);
        // All of them drawn this frame, the deepest too, and not the next.
        const packed: number[] = [];
        for (let at: typeof state | null = state; at !== null; at = at.children[0]?.state ?? null) {
            packed.push(at.instanceCount);
        }
        expect(packed).toEqual([1, 2, 4, 8]);
        expect(warn).not.toHaveBeenCalled();
    });

    it('stops where particles stop, and says so once', () => {
        const warn = quiet();
        const { state, doc } = chain(6);
        for (let i = 0; i < 3; i++) simulateParticles(state, doc as never, 1 / 60, somewhere(), true, noTint, 0);

        expect(liveDown(state)).toHaveLength(MAX_CHILD_DEPTH + 1);
        expect(warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes('set-offs down'))).toHaveLength(1);
    });
});

describe('an effect set off by another', () => {
    it('says once of a child past the limit', () => {
        const warn = quiet();
        const { state } = rocketWithSparks('birth');
        const doc = rocketDoc();
        for (let i = 0; i < 3; i++) simulateParticles(state, doc, 1 / 60, somewhere(), true, noTint, 0, undefined, [], MAX_CHILD_DEPTH);

        expect(state.children[0]!.state).toBeNull();
        expect(warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes('set-offs down'))).toHaveLength(1);
    });

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

    it('makes room for the children\'s particles too, however deep, in the count both backends share', () => {
        const drawn = [cloud(0, [cloud(3, [cloud(2)]), cloud(1)])];

        expect(countDrawn(drawn).particles).toBe(6);
    });
});

describe('a child file for the other dimension', () => {
    it('is left out and said once', () => {
        const warn = quiet();
        const { state, step } = rocketWithSparks('birth');
        const wrong = newParticlesFile('/deep.particles', 'deep') as TParticlesFile;
        wrong.doc = { ...effectDoc(), kind: 'particles-3d' } as never;
        state.children[0]!.file = wrong;
        step();
        step();

        expect(state.children[0]!.state).toBeNull();
        expect(warn.mock.calls.filter((call) => String(call[0]).includes('/deep.particles')).length).toBe(1);
    });
});
