import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { loadShader } from '../src/loaders/shader/load_shader';
import { newShader } from '../src/loaders/shader/new_shader';
import { createScene } from '../src/scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import { compileShader } from '../src/shader_composer/compile_shader';
import { composerSurface } from '../src/shader_composer/inputs';
import type { TMeshMaterial, TSpriteMaterial } from '../src/materials';

/**
 * What a material is, and the split that decides it: in three dimensions the material owns the
 * surface, in two the sprite does. The tests below are mostly about that line, because it is the
 * decision the rest of the feature is built on.
 */

/**
 * Runs a body inside a scene and hands back what it built, which a scene body cannot return.
 */
const inScene = <T>(store: Parameters<typeof startTestScene>[0], name: string, body: () => T): T => {
    let made!: T;
    startTestScene(store, name, () => {
        made = body();
        return createScene();
    });
    return made;
};

const serve = (files: Record<string, string>) =>
    spyOn(globalThis, 'fetch').mockImplementation((async (input: string) => {
        const body = files[input];
        if (body === undefined) {
            return new Response('missing', { status: 404 });
        }
        return new Response(body);
    }) as unknown as typeof fetch);

describe('what a material carries', () => {
    afterEach(() => {
        mock.restore();
    });

    it('gives a model a plain matt white surface when told nothing', () => {
        const material = createMaterial({ shader: 'mesh3d' }) as TMeshMaterial;

        expect(material.tint).toEqual({ r: 1, g: 1, b: 1, a: 1 });
        expect(material.specular).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        expect(material.emissive).toEqual({ r: 0, g: 0, b: 0, a: 1 });
        expect(material.shininess).toBe(32);
        expect(material.alpha).toBe(1);
    });

    it('gives a sprite material no surface at all, because the sprite has its own', () => {
        const material = createMaterial({ fragment: 'fn effect(c: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return c; }' });

        expect(material.shader).toBe('sprite2d');
        expect('tint' in material).toBe(false);
        expect('texture' in material).toBe(false);
    });

    it('leaves the knobs null when there is no shader of its own to turn', () => {
        const material = createMaterial({ shader: 'mesh3d' });

        expect(material.fragment).toBeNull();
        expect(material.uniforms).toBeNull();
        expect(material.uniformSig).toBeNull();
    });

    it('reads what kind each knob is off the value it was given', () => {
        const material = createMaterial({
            fragment: 'fn effect(c: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return c; }',
            uniforms: { strength: 0.5, rim: [1, 0, 0, 1] },
        });

        expect(material.uniformSig).toEqual({ strength: 'f32', rim: 'vec4<f32>' });
    });

    it('refuses a knob named after one the engine fills in itself', () => {
        expect(() => createMaterial({
            fragment: 'fn effect(c: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return c; }',
            uniforms: { time: 1 },
        })).toThrow(/the engine fills in itself/);
    });

    it('refuses a knob that is not a number or a list of two to four', () => {
        expect(() => createMaterial({
            fragment: 'fn effect(c: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return c; }',
            uniforms: { weird: [1, 2, 3, 4, 5] },
        })).toThrow(/two, three or four/);
    });

    it('is a value, so two of them are two, and one handed twice is one', () => {
        const a = createMaterial({ shader: 'mesh3d' });
        const b = createMaterial({ shader: 'mesh3d' });

        expect(a).not.toBe(b);
        expect(a.id).not.toBe(b.id);
    });
});

describe('a material built on a file', () => {
    afterEach(() => {
        mock.restore();
    });

    const FILE = [
        '// @shader mesh3d',
        '// @uniform steps: f32 = 4',
        '// @uniform rim: vec4<f32> = 1, 1, 1, 1',
        'fn effect(surface: vec4<f32>, ctx: FragContext) -> vec4<f32> { return surface; }',
    ].join('\n');

    it('takes the shader on when the file lands, and the family with it', async () => {
        const { store } = createTestGame();
        serve({ '/cel.wgsl': FILE });

        const shader = newShader('/cel.wgsl', '/cel.wgsl');
        const material = inScene(store, 'Level', () => createMaterial({ shader: 'mesh3d', effect: shader }));

        expect(material.fragment).toBeNull();
        await loadShader(store, shader);

        expect(shader.status).toBe('ready');
        expect(material.fragment).toContain('fn effect');
        expect(material.uniforms).toEqual({ steps: 4, rim: [1, 1, 1, 1] });
    });

    it('lets the call site have the last word over the file, whichever arrives first', async () => {
        const { store } = createTestGame();
        serve({ '/cel.wgsl': FILE });

        // Built before the bytes land.
        const early = newShader('/cel.wgsl', '/early');
        const before = inScene(store, 'A', () => createMaterial({ shader: 'mesh3d', effect: early, uniforms: { steps: 9 } }));
        await loadShader(store, early);

        // And built after them.
        const late = newShader('/cel.wgsl', '/late');
        await loadShader(store, late);
        const after = inScene(store, 'B', () => createMaterial({ shader: 'mesh3d', effect: late, uniforms: { steps: 9 } }));

        expect(before.uniforms).toEqual({ steps: 9, rim: [1, 1, 1, 1] });
        expect(after.uniforms).toEqual({ steps: 9, rim: [1, 1, 1, 1] });
    });

    it('fills in every material waiting on one file', async () => {
        const { store } = createTestGame();
        serve({ '/cel.wgsl': FILE });

        const shader = newShader('/cel.wgsl', '/cel.wgsl');
        const [one, two] = inScene(store, 'Level', () => [
            createMaterial({ shader: 'mesh3d', effect: shader }),
            createMaterial({ shader: 'mesh3d', effect: shader }),
        ]);

        await loadShader(store, shader);

        expect(one.fragment).toContain('fn effect');
        expect(two.fragment).toContain('fn effect');
    });

    it('parks in error and leaves the material drawing built-in when the file is not there', async () => {
        const { store } = createTestGame();
        serve({});
        const warn = spyOn(console, 'warn').mockImplementation(() => {});

        const shader = newShader('/gone.wgsl', '/gone.wgsl');
        const material = inScene(store, 'Level', () => createMaterial({ shader: 'mesh3d', effect: shader }));
        await loadShader(store, shader);

        expect(shader.status).toBe('error');
        expect(material.fragment).toBeNull();
        expect(warn).toHaveBeenCalled();
    });

    it('is loud about a name no shader was loaded under', () => {
        const { store } = createTestGame();

        expect(() => inScene(store, 'Level', () => createMaterial({ effect: 'nope' })))
            .toThrow(/no shader loaded under key 'nope'/);
    });
});

describe('which kind of material comes back', () => {
    // Checked by the compiler rather than at run time: the body below is never called, and the
    // test is that `tsc` accepts every line and refuses the two marked ones.
    const typeOnly = () => {
        const forModels: TMeshMaterial = createMaterial({ shader: 'mesh3d' });
        const forSprites: TSpriteMaterial = createMaterial({ fragment: 'fn effect(c: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return c; }' });
        const composed: TMeshMaterial = createMaterial({ ...compileShader({ shader: 'mesh3d', color: composerSurface() }) });
        const composedFlat: TSpriteMaterial = createMaterial({ ...compileShader({ shader: 'sprite2d', color: composerSurface() }) });
        // @ts-expect-error a sprite's material is not a model's.
        const wrong: TMeshMaterial = createMaterial({});
        // @ts-expect-error nor the other way round.
        const alsoWrong: TSpriteMaterial = createMaterial({ shader: 'mesh3d' });
        return [forModels, forSprites, composed, composedFlat, wrong, alsoWrong];
    };

    it('is decided by the family asked for, and the compiler holds each to it', () => {
        expect(typeof typeOnly).toBe('function');
    });
});
