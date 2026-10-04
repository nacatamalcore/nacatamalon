import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createParticles, createParticles3d, emitParticles } from '../src/gameobjects/particles';
import { createParticlePool, createParticleState } from '../src/gameobjects/particles/particle_pool';
import { particleStateOf } from '../src/gameobjects/particles/particle_state';
import { collide2d, collide3d, placeCollider2d, placeCollider3d } from '../src/gameobjects/particles/collide';
import { simulateParticles, simulateParticles3d } from '../src/gameobjects/particles/simulate_particles';
import { newParticlesFile } from '../src/loaders/particles/new_particles_file';
import { loadParticles } from '../src/loaders/particles/load_particles';
import { parseParticlesDoc } from '../src/loaders/particles/parse_particles_doc';
import { useParticleCollider2d, useParticleCollider3d } from '../src/hooks/particles';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { computeModelMatrix } from '../src/render/shared/compute_mvp_3d';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import * as mat from '../src/math/mat4';
import { effectDoc, noTint } from './helpers/particles';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TParticleCollision, TParticlesDoc, TParticlesDoc3d } from '../src/loaders/particles/types/t_particles_doc';
import type { TParticleCollider2d, TParticleCollider3d } from '../src/gameobjects/particles/colliders/t_particle_collider';
import type { TParticlePool } from '../src/gameobjects/particles/types/t_particle_pool';
import type { TRuntimeStore } from '../src/store';

/**
 * Particles running into what the scene says is solid.
 *
 * The pushing and bouncing are checked on their own first, with one particle placed by hand, because
 * that is where the arithmetic is. Then through a game, where what matters is that a collider is
 * where its object is, and last on a staircase, which is what the whole thing is for.
 */

const FRAME = 1 / 60;
const BOUNCE: TParticleCollision = { mode: 'bounce', bounce: 0.5, friction: 0.2 };
const DIE: TParticleCollision = { mode: 'die', bounce: 0, friction: 0 };

const flat = (shape: TParticleCollider2d['shape']): TParticleCollider2d => ({ type: 'particle-collider-2d', id: 'c', shape, enabled: true });
const deep = (shape: TParticleCollider3d['shape']): TParticleCollider3d => ({ type: 'particle-collider-3d', id: 'c', shape, enabled: true });

const place2 = (fields: Partial<{ x: number; y: number; rotation: number; scaleX: number; scaleY: number }> = {}) =>
    ({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...fields });
const matrix = (fields: Record<string, number> = {}) => computeModelMatrix({
    x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1, ...fields,
});

/**
 * A pool holding one particle, at a place and a speed.
 */
const one = (at: [number, number, number], speed: [number, number, number]): TParticlePool => {
    const pool = createParticlePool(4);
    pool.live = 1;
    [pool.x[0], pool.y[0], pool.z[0]] = at;
    [pool.vx[0], pool.vy[0], pool.vz[0]] = speed;
    pool.life[0] = 10;
    return pool;
};

const deepDoc = (fields: Record<string, unknown> = {}): TParticlesDoc3d =>
    parseParticlesDoc({ kind: 'particles3d', ...fields }, '/deep.particles') as TParticlesDoc3d;

let warn: ReturnType<typeof spyOn> | null = null;
afterEach(() => {
    warn?.mockRestore();
    warn = null;
});

describe('what the file says about colliding', () => {
    it('says nothing by default, so every effect written before passes through everything as it did', () => {
        expect(effectDoc().collision).toBeNull();
        expect(deepDoc().collision).toBeNull();
    });

    it('holds the amounts between nothing and all, because more than all would gain speed at every touch', () => {
        expect(effectDoc({ collision: { bounce: 3, friction: -1 } }).collision).toEqual({ mode: 'bounce', bounce: 1, friction: 0 });
    });

    it('refuses a way of colliding that is not one, and names the file', () => {
        expect(() => effectDoc({ collision: { mode: 'stick' } })).toThrow(/test\.particles.*bounce or die/);
    });

    it('says once that a cloud riding its emitter cannot collide', async () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();
        const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => ({
            ok: true, json: async () => ({ kind: 'particles2d', worldSpace: false, collision: { mode: 'die' } }),
        })) as unknown as typeof fetch);
        const { store } = createTestGame();

        await loadParticles(store, newParticlesFile('/aura.particles', 'aura'));
        fetchSpy.mockRestore();

        const said = warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes('no place of their own'));
        expect(said.length).toBe(1);
    });
});

/**
 * One flat step, with the colliders it is handed.
 */
const simulateFlat = (state: ReturnType<typeof createParticleState>, doc: TParticlesDoc, colliders: ReturnType<typeof placeCollider2d>[]) =>
    simulateParticles(state, doc as Parameters<typeof simulateParticles>[1], FRAME, place2(), false, noTint, 0, undefined, colliders);

describe('a flat particle meeting a shape', () => {
    it('comes out of the top of a rect, keeping half its speed back and losing a fifth along', () => {
        // In the upper half, so the top is the nearest way out. Its top is at y = -10, since +y is down.
        const pool = one([10, -2, 0], [40, 100, 0]);
        collide2d(pool, BOUNCE, [placeCollider2d(flat({ kind: 'rect', width: 100, height: 20 }), place2())]);

        expect(pool.y[0]).toBeCloseTo(-10, 5);
        expect(pool.vy[0]).toBeCloseTo(-50, 5);
        expect(pool.vx[0]).toBeCloseTo(32, 5);
    });

    it('ends there instead, for an effect that dies', () => {
        const pool = one([10, 2, 0], [0, 100, 0]);
        collide2d(pool, DIE, [placeCollider2d(flat({ kind: 'rect', width: 100, height: 20 }), place2())]);

        expect(pool.live).toBe(0);
    });

    it('comes out of a circle along the line from its middle', () => {
        const pool = one([3, 4, 0], [0, 0, 0]);
        collide2d(pool, BOUNCE, [placeCollider2d(flat({ kind: 'circle', radius: 10 }), place2())]);

        expect(pool.x[0]).toBeCloseTo(6, 4);
        expect(pool.y[0]).toBeCloseTo(8, 4);
    });

    it('stays on a floor it falls onto, and never ends a frame under it', () => {
        const doc = effectDoc({ collision: { mode: 'bounce', bounce: 0.4 }, gravity: { x: 0, y: 600 }, speed: 0, life: 9, max: 1 });
        const state = createParticleState(doc, 1);
        state.pool.live = 1;
        state.pool.life[0] = 9;
        const floor = [placeCollider2d(flat({ kind: 'plane' }), place2({ y: 100 }))];

        for (let i = 0; i < 180; i++) {
            simulateFlat(state, doc, floor);
            expect(state.pool.y[0]).toBeLessThanOrEqual(100 + 1e-4);
        }
        expect(state.pool.y[0]).toBeGreaterThan(99);
    });

    it('meets a rect where its object put it, turned and stretched', () => {
        // A 10 by 10 rect stretched three times wide, turned upright, and moved: 10 wide, 30 tall.
        const placed = placeCollider2d(flat({ kind: 'rect', width: 10, height: 10 }), place2({ x: 200, y: 50, rotation: Math.PI / 2, scaleX: 3 }));
        const inside = one([200, 60, 0], [0, 0, 0]);
        const outside = one([210, 50, 0], [0, 0, 0]);

        collide2d(inside, BOUNCE, [placed]);
        collide2d(outside, BOUNCE, [placed]);

        // Out through the nearest face, the side, which is 5 from the middle and not 15.
        expect(Math.abs(inside.x[0]! - 200)).toBeCloseTo(5, 4);
        expect(inside.y[0]).toBeCloseTo(60, 4);
        expect(outside.x[0]).toBe(210);
    });
});

describe('a particle in space meeting a shape', () => {
    it('comes out of the top of a box with the bounce and friction it was asked for', () => {
        const pool = one([0.2, 0.4, 0.1], [1, -4, 0]);
        collide3d(pool, BOUNCE, [placeCollider3d(deep({ kind: 'box', size: [2, 1, 2] }), matrix())]);

        expect(pool.y[0]).toBeCloseTo(0.5, 5);
        expect(pool.vy[0]).toBeCloseTo(2, 5);
        expect(pool.vx[0]).toBeCloseTo(0.8, 5);
    });

    it('comes out of a ball, and ends in one for an effect that dies', () => {
        const bounced = one([0, 0.5, 0], [0, 0, 0]);
        const died = one([0, 0.5, 0], [0, 0, 0]);
        const ball = [placeCollider3d(deep({ kind: 'sphere', radius: 2 }), matrix({ x: 0 }))];

        collide3d(bounced, BOUNCE, ball);
        collide3d(died, DIE, ball);

        expect(bounced.y[0]).toBeCloseTo(2, 5);
        expect(died.live).toBe(0);
    });

    it('slides down a floor turned into a slope, and never ends a frame under it', () => {
        const doc = deepDoc({ collision: { mode: 'bounce', bounce: 0, friction: 0 }, gravity: { x: 0, y: -10, z: 0 }, speed: 0, life: 9, max: 1 });
        const state = createParticleState(doc, 1);
        state.pool.live = 1;
        state.pool.life[0] = 9;
        // Dropped where the slope is well above y = 0, so a floor that forgot its turn would let it fall
        // straight through.
        state.pool.x[0] = 1.5;
        state.pool.y[0] = 3;
        // An eighth of a turn about z leans the floor's up towards -x, so it rises along +x and -x is
        // downhill.
        const tilt = Math.PI / 4;
        const slope = [placeCollider3d(deep({ kind: 'plane' }), matrix({ rotation: tilt }))];
        const above = () => -Math.sin(tilt) * state.pool.x[0]! + Math.cos(tilt) * state.pool.y[0]!;

        for (let i = 0; i < 120; i++) {
            simulateParticles3d(state, doc, FRAME, matrix(), false, noTint, undefined, slope);
            expect(above()).toBeGreaterThanOrEqual(-1e-4);
        }
        // Slid downhill past where it landed, rather than stopping there.
        expect(state.pool.x[0]).toBeLessThan(0);
    });

    it('meets a box where its object put it, turned and stretched', () => {
        // A unit box stretched four times long along its own x, then turned a quarter about y, so it
        // now lies along the world's z.
        const placed = placeCollider3d(deep({ kind: 'box', size: [1, 1, 1] }), matrix({ x: 5, rotationY: Math.PI / 2, scaleX: 4 }));
        const inside = one([5.1, 0.3, 1.5], [0, 0, 0]);
        const outside = one([6.5, 0, 0], [0, 0, 0]);

        collide3d(inside, BOUNCE, [placed]);
        collide3d(outside, BOUNCE, [placed]);

        // Out of the top, the shallowest way at 0.2, and not along the long side.
        expect(inside.y[0]).toBeCloseTo(0.5, 4);
        expect(inside.z[0]).toBeCloseTo(1.5, 4);
        expect(outside.x[0]).toBe(6.5);
    });

    it('leaves alone one already on its way out, rather than sending it back in', () => {
        // Born inside a box and heading up out of it, as a fountain standing on one would be.
        const pool = one([0, 0.3, 0], [0, 5, 0]);
        collide3d(pool, BOUNCE, [placeCollider3d(deep({ kind: 'box', size: [2, 1, 2] }), matrix())]);

        expect(pool.y[0]).toBeCloseTo(0.5, 5);
        expect(pool.vy[0]).toBe(5);
    });

    it('lets a collider that is turned off be passed through', () => {
        const pool = one([0, 0, 0], [0, -1, 0]);
        const off = { ...deep({ kind: 'box', size: [2, 2, 2] }), enabled: false };

        collide3d(pool, DIE, [placeCollider3d(off, matrix())]);

        expect(pool.live).toBe(1);
    });
});

describe('a collider on an object in a game', () => {
    const frame = (store: TRuntimeStore) => fillFrameContext(store, { passes: [{}], time: 0, progress: 0, phase: 0 }, FRAME);

    /**
     * A game with a landed effect under `fx` that falls and dies on contact.
     */
    const game = (fields: Record<string, unknown> = {}) => {
        const { store } = createTestGame();
        const file = newParticlesFile('fx', 'fx');
        file.doc = deepDoc({ spread: 0, speed: 0, life: 9, max: 1, gravity: { x: 0, y: -20, z: 0 }, collision: { mode: 'die' }, ...fields });
        file.status = 'ready';
        store.get('assets').particles.set('fx', file);
        return store;
    };

    /**
     * Drops one particle from a height, and says whether it was still alive after a second.
     */
    const survives = (store: TRuntimeStore, emitter: ReturnType<typeof createParticles3d>): boolean => {
        emitParticles(emitter, 1);
        for (let i = 0; i < 60; i++) frame(store);
        return particleStateOf(emitter)!.pool.live === 1;
    };

    it('is where its object is, and moves with it', () => {
        const store = game();
        let emitter!: ReturnType<typeof createParticles3d>;
        let ledge!: ReturnType<typeof useTransform>;
        startTestScene(store, 'S', () => {
            emitter = createParticles3d({ effect: 'fx', autoplay: false, transform: { y: 3 } });
            useSpawn(() => {
                ledge = useTransform({ x: 10 });
                useParticleCollider3d({ shape: { kind: 'box', size: [2, 1, 2] } });
            })();
            return createScene();
        });

        // Ten to the side, so the drop misses it.
        expect(survives(store, emitter)).toBe(true);
        particleStateOf(emitter)!.pool.live = 0;

        // Moved under the drop, and the next one ends on it.
        ledge.x = 0;
        expect(survives(store, emitter)).toBe(false);
    });

    it('is not there while its object is hidden', () => {
        const store = game();
        let emitter!: ReturnType<typeof createParticles3d>;
        startTestScene(store, 'S', () => {
            emitter = createParticles3d({ effect: 'fx', autoplay: false, transform: { y: 3 } });
            useSpawn(() => {
                useParticleCollider3d({ shape: { kind: 'box', size: [2, 1, 2] } });
            })().visible = false;
            return createScene();
        });

        expect(survives(store, emitter)).toBe(true);
    });

    it('does not reach a cloud that travels with its emitter', () => {
        const store = game({ worldSpace: false });
        let emitter!: ReturnType<typeof createParticles3d>;
        startTestScene(store, 'S', () => {
            emitter = createParticles3d({ effect: 'fx', autoplay: false, transform: { y: 3 } });
            useParticleCollider3d({ shape: { kind: 'plane' } });
            return createScene();
        });

        expect(survives(store, emitter)).toBe(true);
    });

    it('works the same in the plane', () => {
        const { store } = createTestGame();
        const file = newParticlesFile('flat', 'flat');
        file.doc = effectDoc({ spread: 0, speed: 0, life: 9, max: 1, gravity: { x: 0, y: 600 }, collision: { mode: 'die' } });
        file.status = 'ready';
        store.get('assets').particles.set('flat', file);
        let emitter!: ReturnType<typeof createParticles>;
        startTestScene(store, 'S', () => {
            emitter = createParticles({ effect: 'flat', autoplay: false, transform: { x: 50, y: 0 } });
            useSpawn(() => {
                useTransform({ x: 50, y: 200 });
                useParticleCollider2d({ shape: { kind: 'rect', width: 100, height: 20 } });
            })();
            return createScene();
        });

        emitParticles(emitter, 1);
        for (let i = 0; i < 60; i++) frame(store);

        expect(particleStateOf(emitter)!.pool.live).toBe(0);
    });
});

describe('a staircase', () => {
    it('keeps every particle of a fountain out of every step, on every frame', () => {
        const store = (() => {
            const { store } = createTestGame();
            const file = newParticlesFile('fountain', 'fountain');
            file.doc = deepDoc({
                emission: { rate: 120 }, max: 400, spread: 1.2, speed: [1, 3], life: [2, 4],
                gravity: { x: 0, y: -9, z: 0 }, collision: { mode: 'bounce', bounce: 0.5, friction: 0.3 },
            });
            file.status = 'ready';
            store.get('assets').particles.set('fountain', file);
            return store;
        })();

        // Six steps going down along +z, each a box one high, one deep and three wide.
        const steps: Float32Array[] = [];
        let emitter!: ReturnType<typeof createParticles3d>;
        startTestScene(store, 'Stairs', () => {
            for (let n = 0; n < 6; n++) {
                useSpawn(() => {
                    useTransform({ y: -n * 0.5, z: n, scaleX: 3, scaleZ: 1 });
                    useParticleCollider3d({ shape: { kind: 'box', size: [1, 1, 1] } });
                })();
                steps.push(computeModelMatrix({ x: 0, y: -n * 0.5, z: n, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 3, scaleY: 1, scaleZ: 1 }));
            }
            emitter = createParticles3d({ effect: 'fountain', seed: 5, transform: { y: 1.5 } });
            return createScene();
        });

        const inverses = steps.map((m) => mat.invert(m, mat.create()));
        let checked = 0;
        for (let f = 0; f < 300; f++) {
            fillFrameContext(store, { passes: [{}], time: 0, progress: 0, phase: 0 }, FRAME);
            const pool = particleStateOf(emitter)!.pool;
            for (let i = 0; i < pool.live; i++) {
                for (const k of inverses) {
                    const lx = k[0]! * pool.x[i]! + k[4]! * pool.y[i]! + k[8]! * pool.z[i]! + k[12]!;
                    const ly = k[1]! * pool.x[i]! + k[5]! * pool.y[i]! + k[9]! * pool.z[i]! + k[13]!;
                    const lz = k[2]! * pool.x[i]! + k[6]! * pool.y[i]! + k[10]! * pool.z[i]! + k[14]!;
                    const inside = Math.abs(lx) < 0.5 - 1e-4 && Math.abs(ly) < 0.5 - 1e-4 && Math.abs(lz) < 0.5 - 1e-4;
                    expect(inside).toBe(false);
                    checked++;
                }
            }
        }
        // Real work was checked, not an empty pool.
        expect(checked).toBeGreaterThan(10000);
    });
});

describe('in a document', () => {
    it('comes back the same, off included, through a second game', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(() => { useParticleCollider2d({ shape: { kind: 'rect', width: 4, height: 2 } }); })();
            useSpawn(() => { useParticleCollider3d({ shape: { kind: 'box', size: [1, 2, 3] }, enabled: false }); })();
            return createScene();
        });
        const doc = serializeScene(root);

        const components = doc.root.children.map((child) => child.components[0]);
        expect(components).toEqual([
            { type: 'particle-collider-2d', id: expect.any(String), shape: { kind: 'rect', width: 4, height: 2 } },
            { type: 'particle-collider-3d', id: expect.any(String), shape: { kind: 'box', size: [1, 2, 3] }, enabled: false },
        ]);
        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);

        const second = createTestGame().store;
        registerScene(second, doc.name, sceneFromDoc(doc));
        expect(serializeScene(startScene(second, doc.name))).toEqual(doc);
    });
});
