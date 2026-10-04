import { describe, expect, it } from 'bun:test';
import {
    buildUniformLayout, writeUniformValues, ENGINE_FIELDS, POST_ENGINE_FIELDS,
} from '../src/render/shared/material_uniforms';

/**
 * Where a material's knobs sit in the block of numbers the card reads.
 *
 * This is the one piece of arithmetic both backends depend on being told the same, and the one that
 * fails invisibly: a knob read from four bytes too far along is not an error anywhere, it is an
 * effect tuned by whatever happened to be next to it.
 */

describe('where the knobs go', () => {
    it('puts the engine fields first, so their place never moves', () => {
        const { offsets } = buildUniformLayout({ strength: 'f32' });

        expect(offsets.time).toBe(0);
        expect(offsets.resolution).toBe(2);
        expect(offsets.strength).toBe(4);
    });

    it('starts a vec3 on a multiple of sixteen bytes, and lets a number tuck in behind it', () => {
        const { offsets, floatCount } = buildUniformLayout({ a: 'f32', b: 'vec3<f32>', c: 'f32' });

        // Four numbers is sixteen bytes, so `b` cannot start right after `a`.
        expect(offsets.a).toBe(4);
        expect(offsets.b).toBe(8);
        expect(offsets.b % 4).toBe(0);
        // The one the whole rule exists for: a vec3 takes twelve of its sixteen, and `c` has the
        // other four.
        expect(offsets.c).toBe(offsets.b + 3);
        expect(floatCount % 4).toBe(0);
    });

    it('declares the same members, in the same order, that it just gave places to', () => {
        const { structText } = buildUniformLayout({ steps: 'f32', rim: 'vec4<f32>' });

        expect(structText).toBe([
            'struct MaterialUniforms {',
            '    time: f32,',
            '    resolution: vec2<f32>,',
            '    steps: f32,',
            '    rim: vec4<f32>,',
            '};',
        ].join('\n'));
    });

    it('gives a screen-wide effect two more, and an ordinary one neither', () => {
        expect(ENGINE_FIELDS.map(([name]) => name)).toEqual(['time', 'resolution']);
        expect(POST_ENGINE_FIELDS.map(([name]) => name)).toEqual(['time', 'resolution', 'progress', 'phase']);

        const post = buildUniformLayout({}, POST_ENGINE_FIELDS);
        expect(post.offsets.progress).toBe(4);
        expect(post.offsets.phase).toBe(5);
        expect(buildUniformLayout({}).offsets.progress).toBeUndefined();
    });
});

describe('filling them in', () => {
    const layout = buildUniformLayout({ strength: 'f32', rim: 'vec4<f32>' });
    const fresh = () => new Float32Array(layout.floatCount);

    it('writes the time and the size of the picture without being asked', () => {
        const data = fresh();
        writeUniformValues(data, layout, {}, 1.5, 320, 240);

        expect(data[layout.offsets.time]).toBe(1.5);
        expect(data[layout.offsets.resolution]).toBe(320);
        expect(data[layout.offsets.resolution + 1]).toBe(240);
    });

    it('writes a number and a list of four', () => {
        const data = fresh();
        writeUniformValues(data, layout, { strength: 0.6, rim: [0.2, 0.4, 0.6, 1] }, 0, 1, 1);

        expect(data[layout.offsets.strength]).toBeCloseTo(0.6, 6);
        expect([...data.slice(layout.offsets.rim, layout.offsets.rim + 4)]).toEqual([
            0.2, 0.4, 0.6, 1,
        ].map((value) => Math.fround(value)));
    });

    it('lets the object have the last word over the material', () => {
        const data = fresh();
        writeUniformValues(data, layout, { strength: 0.6 }, 0, 1, 1, { strength: 0.1 });

        expect(data[layout.offsets.strength]).toBeCloseTo(0.1, 6);
    });

    it('ignores a name the shader does not declare, rather than refusing it', () => {
        const data = fresh();

        expect(() => writeUniformValues(data, layout, { gone: 3 }, 0, 1, 1)).not.toThrow();
    });
});
