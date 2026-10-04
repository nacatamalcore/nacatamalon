import { describe, expect, it } from 'bun:test';
import { buildUniformLayout, ENGINE_FIELDS, POST_ENGINE_FIELDS } from '../src/render/shared/material_uniforms';
import { buildPostShader } from '../src/render/webgpu/post/post_shader';
import { buildPostShaderGlsl } from '../src/render/webgl2/post/post_shader';
import { createMaterial } from '../src/gameobjects/material/create_material';
import { createScene } from '../src/scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import { deriveSignature, MATERIAL_RULES, POST_RULES } from '../src/materials/derive_signature';
import { usePostProcess } from '../src/hooks/post/use_post_process';

/**
 * What the engine fills in for a screen-wide effect, and what that costs an author in names.
 */

const inScene = <T>(store: Parameters<typeof startTestScene>[0], name: string, body: () => T): T => {
    let made!: T;
    startTestScene(store, name, () => {
        made = body();
        return createScene();
    });
    return made;
};

describe('the four an effect is given', () => {
    it('gives a screen-wide effect two more than a drawable, and in that order', () => {
        expect(ENGINE_FIELDS.map(([name]) => name)).toEqual(['time', 'resolution']);
        expect(POST_ENGINE_FIELDS.map(([name]) => name)).toEqual(['time', 'resolution', 'progress', 'phase']);
    });

    it('puts them first, so where they live never depends on what the author asked for', () => {
        const bare = buildUniformLayout({}, POST_ENGINE_FIELDS);
        const busy = buildUniformLayout({ a: 'vec4<f32>', b: 'f32' }, POST_ENGINE_FIELDS);

        for (const name of ['time', 'resolution', 'progress', 'phase']) {
            expect(busy.offsets[name]).toBe(bare.offsets[name]!);
        }
    });

    it('declares the same members in both languages, in the same order', () => {
        const sig = { amount: 'f32', tint: 'vec4<f32>' } as const;
        // Only the block itself: the shaders around it declare plenty of other things.
        const members = (text: string) => {
            const block = /MaterialUniforms\s*\{([^}]*)\}/.exec(text)?.[1] ?? '';
            return [...block.matchAll(/(\w+)\s*:/g)].map((found) => found[1]!)
                .concat([...block.matchAll(/^\s*\w+\s+(\w+);/gm)].map((found) => found[1]!));
        };

        const wgsl = members(buildPostShader('fn effect() {}', sig));
        const glsl = members(buildPostShaderGlsl('vec4 effect() {}', sig).fragment);

        expect(wgsl).toEqual(['time', 'resolution', 'progress', 'phase', 'amount', 'tint']);
        expect(glsl).toEqual(wgsl);
    });
});

describe('what an author may not call a parameter', () => {
    it('refuses the four the engine fills in for an effect', () => {
        for (const name of ['time', 'resolution', 'progress', 'phase']) {
            expect(() => deriveSignature({ [name]: 1 }, POST_RULES)).toThrow(/fills in itself/);
        }
    });

    it('still lets a material call one progress or phase, because there they mean nothing', () => {
        // The promise the material rules make: a name is only taken away where it is really used.
        expect(deriveSignature({ progress: 1, phase: 2 }, MATERIAL_RULES))
            .toEqual({ progress: 'f32', phase: 'f32' });
        expect(() => createMaterial({ fragment: 'fn effect() {}', uniforms: { phase: 0.5 } })).not.toThrow();
    });

    it('says which function refused it, and not always the same one', () => {
        expect(() => deriveSignature({ time: 1 }, MATERIAL_RULES)).toThrow(/createMaterial/);
        expect(() => deriveSignature({ time: 1 }, POST_RULES)).toThrow(/usePostProcess/);
    });

    it('refuses it at the hook, where an author would actually meet it', () => {
        const { store } = createTestGame();

        expect(() => inScene(store, 'Level', () => usePostProcess({
            fragment: 'fn effect() {}',
            uniforms: { phase: 0.5 },
        }))).toThrow(/usePostProcess/);
    });
});
