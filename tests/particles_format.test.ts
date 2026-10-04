import { describe, expect, it } from 'bun:test';
import { parseParticlesDoc, PARTICLES_FORMAT } from '../src/loaders/particles';

/**
 * How a `.particles` file is read.
 *
 * Files of this format already exist on disk in several places and tools write them, so what is
 * pinned here is a contract with things that are not this engine.
 */

const read = (fields: Record<string, unknown>) => parseParticlesDoc({ kind: 'particles2d', ...fields }, '/fx.particles');

describe('what it refuses, and how it says so', () => {
    it('names the file every time, because a game loads a dozen of these', () => {
        expect(() => read({ shape: { kind: 'banana' } })).toThrow(/\/fx\.particles/);
        expect(() => read({ life: 0 })).toThrow(/\/fx\.particles/);
    });

    it('says which kinds of effect there are, rather than failing strangely', () => {
        expect(() => parseParticlesDoc({ kind: 'particles4d' }, '/fx.particles')).toThrow(/It goes particles2d or particles3d/);
    });

    it('refuses a file written by a newer engine, and says which format it reads', () => {
        expect(() => read({ format: PARTICLES_FORMAT + 1 })).toThrow(/format 2 .* reads up to 1/);
    });

    it('tells a shape from the other dimension apart from one that is not a shape at all', () => {
        // Different messages on purpose: the first is somebody using the wrong file, the second is
        // a typo, and sending them looking for the wrong thing costs an afternoon.
        expect(() => read({ shape: { kind: 'sphere' } })).toThrow(/for three dimensions/);
        expect(() => read({ shape: { kind: 'trapezium' } })).toThrow(/not a birth shape/);
    });

    it('refuses a particle that lives for no time, and a colour that is not one', () => {
        expect(() => read({ life: 0 })).toThrow(/longer than no time/);
        expect(() => read({ colorOverLife: [{ t: 0, color: 42 }] })).toThrow(/written as a string/);
    });
});

describe('what it puts right instead of refusing', () => {
    it('widens a bare number into a pair, because "all of them this big" is a thing people write', () => {
        expect(read({ speed: 40 }).speed).toEqual([40, 40]);
    });

    it('turns a pair written backwards the right way round', () => {
        // The intention is never in doubt, and refusing would stop a perfectly good effect loading.
        expect(read({ size: [20, 5] }).size).toEqual([5, 20]);
    });

    it('sorts the curves and keeps their stops inside a life', () => {
        const doc = read({
            colorOverLife: [{ t: 2, color: '#000000' }, { t: -1, color: '#ffffff' }],
        });

        expect(doc.colorOverLife.map((stop) => stop.t)).toEqual([0, 1]);
    });

    it('takes an effect that emits nothing by itself, because something else fires it', () => {
        // Refusing this was a mistake the version before made: the whole file stopped loading over
        // a perfectly good one-shot, to catch a typo its author would see on the first preview.
        const doc = read({ emission: { rate: 0, burst: 0, duration: 0, loop: false } });

        expect(doc.emission.rate).toBe(0);
        expect(doc.emission.burst).toBe(0);
    });

    it('points a fountain upwards when nobody said which way', () => {
        // With y growing downwards, up is a negative quarter turn.
        expect(read({}).direction).toBeCloseTo(-Math.PI / 2, 5);
    });
});

describe('a tail, the effects it sets off, and how far it reaches', () => {
    it('reads all three as the file wrote them', () => {
        const doc = read({
            trail: { length: 10, width: 0.7, fade: true },
            children: [{ on: 'death', src: 'sparks.particles', count: 18 }],
            bounds: { center: { x: 0, y: 1, z: 0 }, size: { x: 4, y: 3, z: 4 } },
        });

        expect(doc.trail).toEqual({ length: 10, width: 0.7, fade: true });
        expect(doc.children).toEqual([{ on: 'death', src: 'sparks.particles', count: 18 }]);
        expect(doc.bounds).toEqual({ center: { x: 0, y: 1, z: 0 }, size: { x: 4, y: 3, z: 4 } });
        expect(doc.unsupported).toEqual({});
    });

    it('refuses a child that does not say which file, or when', () => {
        expect(() => read({ children: [{ on: 'death', count: 2 }] })).toThrow('does not say which file');
        expect(() => read({ children: [{ on: 'hit', src: 'a.particles' }] })).toThrow('birth or death');
    });

    it('keeps what this version still does not read, exactly as it was written', () => {
        // Not the same mistake as inventing a field nobody reads: dropping it would quietly rewrite
        // somebody's work the first time a tool saved it.
        expect(read({ glow: { strength: 2 } }).unsupported).toEqual({ glow: { strength: 2 } });
    });

    it('leaves nothing aside for a file that declares nothing extra', () => {
        expect(read({ max: 10 }).unsupported).toEqual({});
    });
});

describe('the files that actually exist', () => {
    it('reads the sandbox\'s own effects', async () => {
        // Copies of the sandbox's two files, kept beside the tests so they run anywhere.
        const dir = new URL('./fixtures/effects/', import.meta.url).pathname;
        const smoke = await Bun.file(`${dir}smoke.particles`).json();
        const fire = await Bun.file(`${dir}fire.particles`).json();

        expect(parseParticlesDoc(smoke, 'smoke.particles').blend).toBe('alpha');
        expect(parseParticlesDoc(fire, 'fire.particles').blend).toBe('additive');
        expect(parseParticlesDoc(fire, 'fire.particles').max).toBe(220);
    });
});
