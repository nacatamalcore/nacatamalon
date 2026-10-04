import { describe, expect, it } from 'bun:test';
import { emptyParticlesDoc, parseParticlesDoc, serializeParticlesDoc } from '../src/loaders/particles';
import { applyParticlesDoc, measureParticlesBounds, particlesShapeExtent, sampleParticleColor, sampleParticleScale } from '../src/gameobjects/particles/tools';
import { createParticles, particleCount } from '../src/gameobjects/particles';
import { particleStateOf } from '../src/gameobjects/particles/particle_state';
import { newParticlesFile } from '../src/loaders/particles/new_particles_file';
import { createScene } from '../src/scene/create_scene';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { fillFrameContext } from '../src/game/loop/fill_frame_context';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TParticles } from '../src/gameobjects/particles';
import { bakeColorCurve, bakeScaleCurve, CURVE_STEPS } from '../src/gameobjects/particles/bake_curves';
import { effectDoc } from './helpers/particles';

/**
 * What a tool needs from an effect besides running it: writing it back, starting a new one, the
 * footprint and the reach it draws around an emitter, and the curves its editor draws.
 */

describe('writing an effect back out', () => {
    it('reads back exactly what it wrote, tail, children, reach and collision included', () => {
        const doc = effectDoc({
            trail: { length: 6, width: 0.5, fade: false },
            children: [{ on: 'death', src: 'sparks.particles', count: 12 }],
            bounds: { center: { x: 0, y: -40, z: 0 }, size: { x: 80, y: 120, z: 0 } },
            collision: { mode: 'die' },
            colorOverLife: [{ t: 0, color: '#ff8800', alpha: 1 }, { t: 1, color: '#220000', alpha: 0 }],
        });

        expect(parseParticlesDoc(JSON.parse(serializeParticlesDoc(doc)), '/test.particles')).toEqual(doc);
    });

    it('writes nothing for what is not there, so a file does not grow a box of nothing', () => {
        const text = serializeParticlesDoc(effectDoc());

        for (const field of ['"trail"', '"bounds"', '"children"', '"collision"', '"atlas"', '"frame"', '"anim"']) {
            expect(text).not.toContain(field);
        }
        expect(text.endsWith('}\n')).toBe(true);
    });

    it('gives back what this version does not read, as it was written, at the end', () => {
        const text = serializeParticlesDoc(effectDoc({ glow: { strength: 2 } }));

        expect(JSON.parse(text).glow).toEqual({ strength: 2 });
    });

    it('keeps a sheet, a frame or a run, which it reads and writes even though it does not draw them yet', () => {
        const doc = effectDoc({ texture: undefined, atlas: 'sheet.atlas', anim: 'burn' });
        const back = JSON.parse(serializeParticlesDoc(doc));

        expect([back.atlas, back.anim, back.frame]).toEqual(['sheet.atlas', 'burn', undefined]);
    });
});

describe('a new effect', () => {
    it('is one the reader accepts, in either dimension, and shows something at once', () => {
        for (const kind of ['particles2d', 'particles3d'] as const) {
            const doc = emptyParticlesDoc({ kind, texture: 'p.png' });

            expect(parseParticlesDoc(JSON.parse(serializeParticlesDoc(doc)), 'new.particles')).toEqual(doc);
            expect(doc.emission.rate).toBeGreaterThan(0);
            expect(doc.bounds).toBeNull();
        }
    });
});

describe('the footprint of an emitter', () => {
    it('measures where particles are born, not where they go', () => {
        expect(particlesShapeExtent(effectDoc({ shape: { kind: 'circle', radius: 16 } }))).toEqual({ x: 32, y: 32, z: 0 });
        expect(particlesShapeExtent(effectDoc({ shape: { kind: 'rect', width: 40, height: 10 } }))).toEqual({ x: 40, y: 10, z: 0 });
        expect(particlesShapeExtent(effectDoc())).toEqual({ x: 0, y: 0, z: 0 });
    });
});

describe('the curves a gradient editor draws', () => {
    it('are the very ones the particles are baked with', () => {
        const doc = effectDoc({
            colorOverLife: [{ t: 0, color: '#ffffff', alpha: 1 }, { t: 0.3, color: '#ff8800', alpha: 1 }, { t: 1, color: '#220000', alpha: 0 }],
            sizeOverLife: [{ t: 0, scale: 1 }, { t: 1, scale: 0.1 }],
        });
        const colors = bakeColorCurve(doc.colorOverLife);
        const scales = bakeScaleCurve(doc.sizeOverLife);
        const out = { r: 0, g: 0, b: 0, a: 0 };

        for (let i = 0; i <= CURVE_STEPS; i++) {
            const c = sampleParticleColor(doc.colorOverLife, i / CURVE_STEPS, out);
            expect([c.r, c.g, c.b, c.a].map((v) => Math.fround(v))).toEqual(Array.from(colors.slice(i * 4, i * 4 + 4)));
            expect(Math.fround(sampleParticleScale(doc.sizeOverLife, i / CURVE_STEPS))).toBe(scales[i]!);
        }
    });
});

describe('how far an effect reaches', () => {
    const fountain = () => effectDoc({
        max: 60, life: 1, speed: 100, spread: 0, direction: -Math.PI / 2, size: 4, gravity: { x: 0, y: 0 },
        emission: { rate: 30, burst: 0, duration: 0, loop: true },
    });

    it('is measured by running it: a fountain straight up reaches up, not down', () => {
        const bounds = measureParticlesBounds(fountain())!;

        expect(bounds.center.y).toBeLessThan(0);
        // A second of flight at 100 px/s, plus half a particle each end, plus five per cent.
        expect(bounds.size.y).toBeGreaterThan(95);
        expect(bounds.size.y).toBeLessThan(115);
        expect(bounds.size.z).toBe(0);
    });

    it('gives the same box every time, so re-measuring an unchanged effect changes nothing', () => {
        expect(measureParticlesBounds(fountain())).toEqual(measureParticlesBounds(fountain()));
    });

    it('takes the tail in: the tail is drawn, so it is inside the box', () => {
        const sideways = { ...fountain(), direction: 0, life: [0.2, 0.2] as [number, number] };
        const plain = measureParticlesBounds(sideways)!;
        const tailed = measureParticlesBounds({ ...sideways, trail: { length: 30, width: 3, fade: false } })!;

        expect(tailed.size.y).toBeGreaterThan(plain.size.y);
    });

    it('says it could not measure one that makes nothing, instead of a box of nothing', () => {
        expect(measureParticlesBounds(effectDoc({ emission: { rate: 0, burst: 0 } }))).toBeNull();
    });
});

describe('editing an effect that is running', () => {
    const running = () => {
        const { store } = createTestGame();
        const file = newParticlesFile('fx', 'fx');
        file.doc = effectDoc({ max: 40, life: 5, emission: { rate: 0, burst: 20, duration: 0, loop: false } });
        file.status = 'ready';
        store.get('assets').particles.set('fx', file);
        let emitter!: TParticles;
        startTestScene(store, 'Preview', () => {
            emitter = createParticles({ effect: 'fx' });
            return createScene();
        });
        const ctx = createFrameContext();
        const frame = () => fillFrameContext(store, ctx, 1 / 60);
        frame();
        return { emitter, file, frame };
    };

    it('keeps the particles in the air when a curve changes, and uses the new curve', () => {
        const { emitter, file, frame } = running();
        expect(particleCount(emitter)).toBe(20);

        applyParticlesDoc(emitter, { ...file.doc!, sizeOverLife: [{ t: 0, scale: 3 }] });
        frame();

        expect(particleCount(emitter)).toBe(20);
        expect(particleStateOf(emitter)!.scaleTable[0]).toBe(3);
    });

    it('starts again when how many it may hold changes, since that is the size of its arrays', () => {
        const { emitter, file, frame } = running();
        applyParticlesDoc(emitter, { ...file.doc!, max: 10 });
        frame();

        expect(particleStateOf(emitter)!.pool.capacity).toBe(10);
    });
});
