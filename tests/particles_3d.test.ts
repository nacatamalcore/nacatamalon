import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScene } from '../src/scene/create_scene';
import { createMesh } from '../src/gameobjects/mesh';
import { createParticles, createParticles3d, emitParticles } from '../src/gameobjects/particles';
import { createParticleState } from '../src/gameobjects/particles/particle_pool';
import { openParticleState, particleStateOf } from '../src/gameobjects/particles/particle_state';
import { simulateParticles, simulateParticles3d } from '../src/gameobjects/particles/simulate_particles';
import { newParticlesFile } from '../src/loaders/particles/new_particles_file';
import { parseParticlesDoc } from '../src/loaders/particles/parse_particles_doc';
import { useCubeGeometry } from '../src/hooks/geometry';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { computeModelMatrix } from '../src/render/shared/compute_mvp_3d';
import { PARTICLE_3D_OFFSET, PARTICLE_FLOATS, PARTICLE_OFFSET } from '../src/render/shared/particle_instance';
import { effectDoc, noTint, somewhere } from './helpers/particles';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TFrameContext } from '../src/render';
import type { TParticlesDoc3d } from '../src/loaders/particles/types/t_particles_doc';
import type { TParticleState } from '../src/gameobjects/particles/types/t_particle_pool';
import type { TParticlesFile } from '../src/loaders/particles/types/t_particles_file';
import type { TRuntimeStore } from '../src/store';

/**
 * Particles in three dimensions: the file, where they are born and which way they go, how they
 * travel with an emitter that asks for it, and how they reach the frame.
 *
 * Most of it is checked with the simulation alone, which is a function of what it is given. The
 * few claims about the frame are made through a game with no card.
 */

const FRAME = 1 / 60;

const deep = (fields: Record<string, unknown> = {}): TParticlesDoc3d =>
    parseParticlesDoc({ kind: 'particles3d', ...fields }, '/deep.particles') as TParticlesDoc3d;

/**
 * Where an emitter is, as the matrix its box's composition would leave it.
 */
const placed = (fields: Record<string, number> = {}): Float32Array => computeModelMatrix({
    x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, ...fields,
});

/**
 * Every living particle's place and speed, read straight off the pool.
 */
const living = (state: TParticleState) => Array.from({ length: state.pool.live }, (_, i) => ({
    x: state.pool.x[i]!, y: state.pool.y[i]!, z: state.pool.z[i]!,
    vx: state.pool.vx[i]!, vy: state.pool.vy[i]!, vz: state.pool.vz[i]!,
}));

/**
 * `count` particles born in one frame, with nothing moving them yet.
 */
const burst = (doc: TParticlesDoc3d, count: number, matrix = placed(), seed = 7): TParticleState => {
    const state = createParticleState(doc, seed);
    state.pending = count;
    simulateParticles3d(state, doc, 0, matrix, false, noTint);
    return state;
};

const angleBetween = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z;
    return Math.acos(Math.min(1, Math.max(-1, dot / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)))));
};

let warn: ReturnType<typeof spyOn> | null = null;
afterEach(() => {
    warn?.mockRestore();
    warn = null;
});

describe('the file, for three dimensions', () => {
    it('reads with defaults in units rather than pixels, straight up, and falls nowhere', () => {
        const doc = deep();

        expect(doc.kind).toBe('particles3d');
        // Pixel defaults of forty to ninety would send every particle a hundred metres a second.
        expect(doc.speed).toEqual([1, 2]);
        expect(doc.size).toEqual([0.1, 0.25]);
        expect(doc.direction).toEqual({ x: 0, y: 1, z: 0 });
        expect(doc.gravity).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('makes the direction one unit long, so a birth can multiply it by a speed and be done', () => {
        const { direction } = deep({ direction: { x: 3, y: 4, z: 0 } });

        expect(direction.x).toBeCloseTo(0.6, 6);
        expect(direction.y).toBeCloseTo(0.8, 6);
    });

    it('refuses a direction of no length, which points nowhere, and names the file', () => {
        expect(() => deep({ direction: { x: 0, y: 0, z: 0 } })).toThrow(/\/deep\.particles.*points nowhere/);
    });

    it('tells a shape of the other dimension apart, both ways round', () => {
        expect(() => deep({ shape: { kind: 'circle', radius: 1 } })).toThrow(/flat shape, and this is a particles3d/);
        expect(() => effectDoc({ shape: { kind: 'sphere' } })).toThrow(/for three dimensions/);
        expect(() => deep({ shape: { kind: 'blob' } })).toThrow(/point, sphere, box or cone/);
    });

    it('reads the demo project\'s own two files, reach and all', () => {
        // Copies of the editor demo project's two files, kept beside the tests so they run anywhere.
        const effects = join(import.meta.dir, 'fixtures/effects');
        for (const name of ['geyser', 'dust']) {
            const doc = parseParticlesDoc(JSON.parse(readFileSync(join(effects, `${name}.particles`), 'utf8')), name);
            expect(doc.kind).toBe('particles3d');
            expect(doc.bounds).not.toBeNull();
            expect(doc.unsupported).toEqual({});
        }
    });
});

describe('where they are born, and which way they go', () => {
    it('keeps a ball\'s births inside it, and an edge\'s on its surface', () => {
        const inside = burst(deep({ shape: { kind: 'sphere', radius: 2 }, max: 400 }), 400);
        const onEdge = burst(deep({ shape: { kind: 'sphere', radius: 2, edge: true }, max: 400 }), 400);

        const reach = (p: { x: number; y: number; z: number }) => Math.hypot(p.x, p.y, p.z);
        expect(Math.max(...living(inside).map(reach))).toBeLessThanOrEqual(2 + 1e-5);
        // Spread through the volume and not bunched in the middle: with the cube root, half of them
        // lie beyond 0.79 of the radius; without it, barely a fifth would.
        const outer = living(inside).filter((p) => reach(p) > 2 * Math.cbrt(0.5)).length;
        expect(outer / 400).toBeGreaterThan(0.4);
        for (const p of living(onEdge)) {
            expect(reach(p)).toBeCloseTo(2, 4);
        }
    });

    it('keeps a box\'s births inside its three sizes', () => {
        const state = burst(deep({ shape: { kind: 'box', size: [4, 0.2, 2] }, max: 300 }), 300);

        for (const p of living(state)) {
            expect(Math.abs(p.x)).toBeLessThanOrEqual(2);
            expect(Math.abs(p.y)).toBeLessThanOrEqual(0.1 + 1e-6);
            expect(Math.abs(p.z)).toBeLessThanOrEqual(1);
        }
    });

    it('sends a cone\'s particles out along its wall, at exactly its angle', () => {
        const state = burst(deep({ shape: { kind: 'cone', radius: 0.5, angle: 0.3 }, max: 200 }), 200);

        const axis = { x: 0, y: 1, z: 0 };
        for (const p of living(state)) {
            // Born on the flat disc across the axis...
            expect(p.y).toBeCloseTo(0, 5);
            // ...and sent out at the wall's angle, leaning the way it was born.
            expect(angleBetween({ x: p.vx, y: p.vy, z: p.vz }, axis)).toBeCloseTo(0.3, 4);
            if (Math.hypot(p.x, p.z) > 0.05) {
                expect(p.vx * p.x + p.vz * p.z).toBeGreaterThan(0);
            }
        }
    });

    it('keeps every direction inside the cap `spread` allows, spread evenly over it', () => {
        const state = burst(deep({ spread: 1, max: 600 }), 600);
        const angles = living(state).map((p) => angleBetween({ x: p.vx, y: p.vy, z: p.vz }, { x: 0, y: 1, z: 0 }));

        expect(Math.max(...angles)).toBeLessThanOrEqual(0.5 + 1e-5);
        // Even over the cap puts most of them near its rim, where there is more room. Drawing the
        // angle evenly instead, the beam with a halo, would put half of them inside a quarter.
        const nearAxis = angles.filter((angle) => angle < 0.25).length;
        expect(nearAxis / 600).toBeLessThan(0.35);
    });

    it('places, aims and sizes by the emitter\'s matrix: turned, stretched and moved', () => {
        const doc = deep({ spread: 0, speed: 2, size: 1, max: 4 });
        // A quarter turn about z sends "up" to the left; twice the size doubles speed and size.
        const matrix = placed({ x: 5, y: 1, z: -3, rotation: Math.PI / 2, scaleX: 2, scaleY: 2, scaleZ: 2 });

        const state = burst(doc, 1, matrix);
        const [p] = living(state);

        expect([p!.x, p!.y, p!.z]).toEqual([5, 1, -3]);
        expect(p!.vx).toBeCloseTo(-4, 5);
        expect(p!.vy).toBeCloseTo(0, 5);
        expect(p!.vz).toBeCloseTo(0, 5);
        expect(state.pool.size[0]).toBeCloseTo(2, 5);
    });

    it('stretches where they are born along each axis, but never bends which way they go', () => {
        // Aimed half right and half up, so a stretch that leaked into the direction would tip it.
        const doc = deep({ shape: { kind: 'box', size: [1, 1, 1] }, direction: { x: 1, y: 1, z: 0 }, spread: 0, max: 200 });
        const state = burst(doc, 200, placed({ scaleX: 10, scaleY: 1, scaleZ: 1 }));

        expect(Math.max(...living(state).map((p) => Math.abs(p.x)))).toBeGreaterThan(4);
        for (const p of living(state)) {
            expect(p.vx).toBeCloseTo(p.vy, 4);
            expect(p.vz).toBeCloseTo(0, 5);
        }
    });
});

describe('how they move', () => {
    it('falls along all three axes, with +y up', () => {
        const doc = deep({ spread: 0, speed: 0, gravity: { x: 0, y: -10, z: 4 }, life: 5, max: 1 });
        const state = burst(doc, 1);

        for (let i = 0; i < 60; i++) {
            simulateParticles3d(state, doc, FRAME, placed(), false, noTint);
        }

        const [p] = living(state);
        expect(p!.vy).toBeCloseTo(-10, 3);
        expect(p!.vz).toBeCloseTo(4, 3);
        expect(p!.y).toBeLessThan(-4);
        expect(p!.z).toBeGreaterThan(1.5);
    });

    it('replays exactly from the same seed', () => {
        const doc = deep({ emission: { rate: 50 }, shape: { kind: 'sphere', radius: 1 } });
        const run = () => {
            const state = createParticleState(doc, 42);
            for (let i = 0; i < 90; i++) {
                simulateParticles3d(state, doc, FRAME, placed(), true, noTint);
            }
            return Array.from(state.instances.subarray(0, state.instanceCount * PARTICLE_FLOATS));
        };

        expect(run().length).toBeGreaterThan(0);
        expect(run()).toEqual(run());
    });

    it('packs each particle where its draw reads it', () => {
        const doc = deep({ spread: 0, speed: 0, size: 3, life: 5, max: 1 });
        const state = burst(doc, 1, placed({ x: 1, y: 2, z: 3 }));
        simulateParticles3d(state, doc, 0, placed(), false, { r: 1, g: 1, b: 1, a: 0.5 });

        expect(state.instances[PARTICLE_3D_OFFSET.x]).toBe(1);
        expect(state.instances[PARTICLE_3D_OFFSET.y]).toBe(2);
        expect(state.instances[PARTICLE_3D_OFFSET.z]).toBe(3);
        expect(state.instances[PARTICLE_3D_OFFSET.size]).toBe(3);
        expect(state.instances[PARTICLE_3D_OFFSET.a]).toBe(0.5);
    });
});

describe('particles that travel with their emitter', () => {
    it('in three dimensions: moving the emitter moves the cloud, and only when it asks', () => {
        const drawnX = (worldSpace: boolean): [number, number] => {
            const doc = deep({ worldSpace, spread: 0, speed: 0, life: 5, max: 1 });
            const state = burst(doc, 1, placed({ x: 0 }));
            simulateParticles3d(state, doc, FRAME, placed({ x: 0 }), false, noTint);
            const before = state.instances[PARTICLE_3D_OFFSET.x]!;
            simulateParticles3d(state, doc, FRAME, placed({ x: 10 }), false, noTint);
            return [before, state.instances[PARTICLE_3D_OFFSET.x]!];
        };

        expect(drawnX(false)).toEqual([0, 10]);
        expect(drawnX(true)).toEqual([0, 0]);
    });

    it('in the plane: the same, turn included', () => {
        const drawn = (worldSpace: boolean): number[] => {
            const doc = effectDoc({ worldSpace, spread: 0, speed: 0, life: 5, max: 1, shape: { kind: 'rect', width: 0, height: 0 } });
            const state = createParticleState(doc, 3);
            state.pending = 1;
            simulateParticles(state, doc, 0, somewhere(), false, noTint, 0);
            // A particle ten to the right of the emitter, then the emitter moved and turned.
            state.pool.x[0] = 10;
            simulateParticles(state, doc, 0, somewhere({ x: 100, y: 50, rotation: Math.PI / 2 }), false, noTint, 0);
            return [state.instances[PARTICLE_OFFSET.x]!, state.instances[PARTICLE_OFFSET.y]!].map((n) => Math.round(n * 1000) / 1000);
        };

        expect(drawn(false)).toEqual([100, 60]);
        expect(drawn(true)).toEqual([10, 0]);
    });
});

describe('an emitter handed the other dimension', () => {
    /**
     * A file that has landed, with the document it says.
     */
    const landed = (store: TRuntimeStore, key: string, doc: ReturnType<typeof parseParticlesDoc>): TParticlesFile => {
        const file = newParticlesFile(key, key);
        file.doc = doc;
        file.status = 'ready';
        store.get('assets').particles.set(key, file);
        return file;
    };

    it('is refused on the line that made it, when the file is already here', () => {
        const { store } = createTestGame();
        landed(store, 'flat', effectDoc());
        landed(store, 'deep', deep());

        startTestScene(store, 'S', () => {
            expect(() => createParticles3d({ effect: 'flat' })).toThrow(/particles2d effect, so it is made with createParticles\./);
            expect(() => createParticles({ effect: 'deep' })).toThrow(/particles3d effect, so it is made with createParticles3d/);
            return createScene();
        });
    });

    it('says so once and draws nothing, when the file lands afterwards', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        // Spies share their history across tests in this runner, so this one starts empty.
        warn.mockClear();
        const { store } = createTestGame();
        const file = newParticlesFile('late', 'late');
        store.get('assets').particles.set('late', file);

        let emitter: ReturnType<typeof createParticles3d> | null = null;
        startTestScene(store, 'S', () => {
            emitter = createParticles3d({ effect: 'late' });
            return createScene();
        });

        file.doc = effectDoc();
        file.status = 'ready';
        expect(openParticleState(emitter!)).toBeNull();
        for (let i = 0; i < 3; i++) {
            fillFrameContext(store, { passes: [{}], time: 0, progress: 0, phase: 0 }, FRAME);
        }

        expect(particleStateOf(emitter!)).toBeNull();
        const said = warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes('createParticles.'));
        expect(said.length).toBe(1);
    });
});

describe('on its way to the frame', () => {
    const frame = (store: TRuntimeStore) => {
        const ctx: TFrameContext = { passes: [{}], time: 0, progress: 0, phase: 0 };
        fillFrameContext(store, ctx, FRAME);
        return ctx.passes[0];
    };

    it('opens its scene\'s view in depth, even with no model in it', () => {
        const { store } = createTestGame();
        const file = newParticlesFile('fx', 'fx');
        file.doc = deep({ emission: { burst: 5 } });
        file.status = 'ready';
        store.get('assets').particles.set('fx', file);

        startTestScene(store, 'S', () => {
            createParticles3d({ effect: 'fx', seed: 1 });
            return createScene();
        });

        const pass = frame(store);
        expect(pass.drawables!.map((item) => item.type)).toEqual(['particles3d']);
        expect(pass.views3d!.length).toBe(1);
        expect(pass.viewIndex![0]).toBe(0);
        // The stand-in went, never the record: it carries the packed particles.
        expect((pass.drawables![0] as unknown as { count: number }).count).toBe(5);
    });

    it('is drawn after the models it ties with, which is what something see-through needs', () => {
        const { store } = createTestGame();
        const file = newParticlesFile('fx', 'fx');
        file.doc = deep();
        file.status = 'ready';
        store.get('assets').particles.set('fx', file);

        startTestScene(store, 'S', () => {
            // Made first on purpose: left in the order of making, it would be drawn under the model.
            createParticles3d({ effect: 'fx' });
            createMesh({ geometry: useCubeGeometry() });
            return createScene();
        });

        const pass = frame(store);
        expect(pass.drawables!.map((item) => item.type)).toEqual(['mesh', 'particles3d']);
        expect(pass.viewIndex).toEqual([0, 0]);
    });

    it('is born where its box put it, turned and moved', () => {
        const { store } = createTestGame();
        const file = newParticlesFile('fx', 'fx');
        file.doc = deep({ spread: 0, speed: 0, max: 1 });
        file.status = 'ready';
        store.get('assets').particles.set('fx', file);

        let emitter: ReturnType<typeof createParticles3d> | null = null;
        const root = startTestScene(store, 'S', () => {
            emitter = createParticles3d({ effect: 'fx', autoplay: false, transform: { y: 1 } });
            return createScene();
        });
        root.transform = { x: 4, y: 0, z: -2, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

        emitParticles(emitter!, 1);
        frame(store);

        const [p] = living(particleStateOf(emitter!)!);
        expect([p!.x, p!.y, p!.z]).toEqual([4, 1, -2]);
    });
});
