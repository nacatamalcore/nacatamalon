import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { loadShader } from '../src/loaders/shader/load_shader';
import { newShader } from '../src/loaders/shader/new_shader';
import { createScene } from '../src/scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import { compileShader } from '../src/shader_composer/compile_shader';
import { composerSurface } from '../src/shader_composer/inputs';
import type { TMaterial, TMaterialOptions, TMeshMaterial, TMeshMaterialOptions, TSpriteMaterial } from '../src/materials';

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

    it('keeps a material of the other family built-in, and says so once, whichever arrives first', async () => {
        const { store } = createTestGame();
        serve({ '/cel.wgsl': FILE });
        const warn = spyOn(console, 'warn').mockImplementation(() => {});

        // Built before the bytes land, then two more after them: a sprite has no FragContext.
        const shader = newShader('/cel.wgsl', '/cel.wgsl');
        const before = inScene(store, 'A', () => createMaterial({ effect: shader }));
        await loadShader(store, shader);
        const after = inScene(store, 'B', () => [createMaterial({ effect: shader }), createMaterial({ name: 'glow', effect: shader })]);

        for (const material of [before, ...after]) {
            expect(material.shader).toBe('sprite2d');
            expect(material.fragment).toBeNull();
            expect(material.vertex).toBeNull();
        }
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain(`'/cel.wgsl' is a mesh3d shader, but the material is sprite2d`);
    });

    it('says it again for the other family, and not at all when the families agree', async () => {
        const { store } = createTestGame();
        serve({ '/cel.wgsl': FILE, '/plain.wgsl': 'fn effect(c: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return c; }' });
        const warn = spyOn(console, 'warn').mockImplementation(() => {});

        const plain = newShader('/plain.wgsl', '/plain.wgsl');
        await loadShader(store, plain);
        const [sprite, model] = inScene(store, 'Level', () => [
            createMaterial({ effect: plain }),
            createMaterial({ shader: 'mesh3d', name: 'hull', effect: plain }),
        ]);

        // A file with no `@shader` line is for sprites.
        expect(sprite.fragment).toContain('fn effect');
        expect(model.fragment).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain(`'/plain.wgsl' is a sprite2d shader, but the material "hull" is mesh3d`);
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

    // The same, called the ways a game of some size calls it: from a function of its own, with
    // options built elsewhere, with options of either kind.
    const typeOnlyAtLarge = () => {
        const glass = <O extends TMeshMaterialOptions>(options: O): TMeshMaterial => createMaterial(options);
        const built: TMeshMaterialOptions = { shader: 'mesh3d', alpha: 0.5 };
        const fromBuilt: TMeshMaterial = createMaterial(built);
        const either = (options: TMaterialOptions): TMaterial => createMaterial(options);
        const kept = either({ shader: 'mesh3d' });
        // Either kind of options, either kind of material: narrowed by its shader.
        const narrowed: TMeshMaterial | null = kept.shader === 'mesh3d' ? kept : null;
        // @ts-expect-error until it is narrowed, it could be a sprite's.
        const unnarrowed: TMeshMaterial = kept;
        // @ts-expect-error an option it does not have is still refused where it is written.
        const typo = createMaterial({ shader: 'mesh3d', tintt: 1 });
        return [glass({ shader: 'mesh3d' }), fromBuilt, narrowed, unnarrowed, typo];
    };

    it('holds when called from a function of the game\'s own, or with options built elsewhere', () => {
        expect(typeof typeOnlyAtLarge).toBe('function');
    });
});

describe('uniforms, when they were handed in', () => {
    it('are typed as there, so a parameter is animated with no `?? {}`', () => {
        const { store } = createTestGame();
        const [mesh, sprite] = inScene(store, 'Level', () => [
            createMaterial(compileShader({ shader: 'mesh3d', color: composerSurface() })),
            createMaterial({ fragment: 'fn effect(c: vec4<f32>, uv: vec2<f32>) -> vec4<f32> { return c; }', uniforms: { glow: 0 } }),
        ] as const);

        // These two lines are the test as much as the expects: they do not compile with `| null`.
        mesh.uniforms.swell = 0.3;
        sprite.uniforms.glow = 1;
        expect(mesh.uniforms.swell).toBe(0.3);
        expect(sprite.uniforms.glow).toBe(1);
    });

    it('are still possibly null when none were handed in, since then there may be no shader to read them', () => {
        const { store } = createTestGame();
        const plain = inScene(store, 'Level', () => createMaterial({ shader: 'mesh3d' }));

        expect(plain.uniforms).toBeNull();
        // Never called: only here to be compiled.
        const _typed = () => {
            // @ts-expect-error: a material made without uniforms may have none.
            plain.uniforms.glow = 1;
        };
        void _typed;
    });

    it('come back as the same bag, even with no shader yet to read them', () => {
        const { store } = createTestGame();
        const bag = { glow: 0.5 };
        const material = inScene(store, 'Level', () => createMaterial({ shader: 'mesh3d', uniforms: bag }));

        expect(material.uniforms).toBe(bag);
    });
});
