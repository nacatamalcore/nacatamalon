import { describe, expect, it } from 'bun:test';
import { compileShader } from '../src/shader_composer/compile_shader';
import { composerSwizzle, composerVec3, composerVec4, composerX } from '../src/shader_composer/constructors';
import {
    composerLight, composerSurface, composerTextureSample, composerTime, composerUniform, composerUv,
    composerVertexNormal, composerVertexPosition,
} from '../src/shader_composer/inputs';
import { composerAdd, composerClamp, composerMix, composerMod, composerMul, composerSin } from '../src/shader_composer/math';
import { composerPipe } from '../src/shader_composer/pipe';
import { composerFbm, composerSimplexNoise } from '../src/shader_composer/noise';
import { composerFresnel } from '../src/shader_composer/effects';

/**
 * Writing a shader as typed values: what `compileShader` writes out, and what it refuses.
 *
 * The output is compared as text on purpose. The two backends compile these strings, so the
 * string is the contract, and a change to how they are written should be a change somebody saw.
 */

const gradient = () => composerVec4(
    composerMix(composerVec3(0.1, 0.2, 0.4), composerVec3(0.9, 0.6, 0.2), composerSwizzle(composerUv(), 'y')),
    1,
);

describe('what it writes', () => {
    it('spreads into createMaterial: the family, both languages of each hook, and the parameters', () => {
        const compiled = compileShader({ shader: 'sprite2d', color: composerVec4(composerUniform('glow', 0.5), 0, 0, 1) });

        expect(Object.keys(compiled).sort()).toEqual(['fragment', 'fragmentGlsl', 'shader', 'uniforms', 'vertex', 'vertexGlsl']);
        expect(compiled.shader).toBe('sprite2d');
        expect(compiled.vertex).toBeUndefined();
        expect(compiled.vertexGlsl).toBeUndefined();
        expect(compiled.uniforms).toEqual({ glow: 0.5 });
    });

    it('writes a sprite colour hook with the signature the engine calls', () => {
        const fragment = compileShader({ shader: 'sprite2d', color: composerSurface() }).fragment;

        expect(fragment).toBe('fn effect(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {\n    return color;\n}');
    });

    it('reads each leaf the way its stage offers it', () => {
        const sprite = compileShader({ shader: 'sprite2d', color: composerVec4(composerX(composerUv()), composerTime(), 0, 1) });
        const model = compileShader({ shader: 'mesh3d', color: composerVec4(composerX(composerUv()), composerLight()) });

        expect(sprite.fragment).toContain('(uv).x');
        expect(sprite.fragment).toContain('mu.time');
        expect(model.fragment).toContain('(ctx.uv).x');
        expect(model.fragment).toContain('ctx.light');
    });

    it('works out a value used twice only once', () => {
        const shared = composerSin(composerTime());
        const fragment = compileShader({ shader: 'sprite2d', color: composerVec4(composerAdd(shared, shared), 0, 0, 1) }).fragment!;

        expect(fragment).toContain('let v0 = sin(mu.time);');
        expect(fragment).toContain('(v0 + v0)');
        expect(fragment.match(/sin\(mu\.time\)/g)).toHaveLength(1);
    });

    it('does not make a local out of a bare leaf, however often it is used', () => {
        const fragment = compileShader({
            shader: 'sprite2d',
            color: composerVec4(composerAdd(composerTime(), composerTime()), 0, 0, 1),
        }).fragment!;

        expect(fragment).not.toContain('let ');
    });

    it('turns a vec3 colour into a vec4 with a solid alpha', () => {
        const fragment = compileShader({ shader: 'sprite2d', color: composerVec3(1, 0, 0) }).fragment!;

        expect(fragment).toContain('vec4<f32>(vec3<f32>(1.0, 0.0, 0.0), 1.0)');
    });

    it('writes a model vertex hook when there is a position, and leaves the colour to the engine', () => {
        const compiled = compileShader({
            shader: 'mesh3d',
            position: composerAdd(composerVertexPosition(), composerMul(composerVertexNormal(), composerUniform('amp', 0.1))),
        });

        expect(compiled.fragment).toBeUndefined();
        expect(compiled.vertex).toContain('fn vertex(pos: vec3<f32>, ctx: VertContext) -> vec3<f32>');
        expect(compiled.vertex).toContain('(pos + (ctx.normal * mu.amp))');
    });

    it('writes each noise function once, at the top of the shader, even when two nodes need it', () => {
        const fragment = compileShader({
            shader: 'sprite2d',
            color: composerVec4(composerAdd(composerSimplexNoise(composerUv()), composerFbm(composerUv(), 3)), 0, 0, 1),
        }).fragment!;

        expect(fragment.match(/fn sgNoise3\(/g)).toHaveLength(1);
        expect(fragment.match(/fn sgHash13\(/g)).toHaveLength(1);
        expect(fragment.indexOf('fn sgNoise3(')).toBeLessThan(fragment.indexOf('fn effect('));
    });

    it('puts the helpers in the vertex hook when there is no colour one to carry them', () => {
        const compiled = compileShader({
            shader: 'mesh3d',
            position: composerAdd(composerVertexPosition(), composerMul(composerVertexNormal(), composerSimplexNoise(composerVertexPosition()))),
        });

        expect(compiled.vertex).toContain('fn sgNoise3(');
        expect(compiled.vertexGlsl).toContain('float sgNoise3(');
    });

    it('gathers every parameter with the value it starts at', () => {
        const compiled = compileShader({
            shader: 'mesh3d',
            color: composerVec4(composerMul(composerSwizzle(composerSurface(), 'rgb'), composerUniform('tint', [1, 0.5, 0])), composerUniform('alpha', 0.8)),
        });

        expect(compiled.uniforms).toEqual({ tint: [1, 0.5, 0], alpha: 0.8 });
    });

    it('lets a pipe read left to right and mean the same as the nested calls', () => {
        const piped = composerPipe(composerTime(), composerMul(2), composerAdd(1), composerSin);
        const nested = composerSin(composerAdd(composerMul(composerTime(), 2), 1));

        expect(compileShader({ shader: 'sprite2d', color: composerVec4(piped, 0, 0, 1) }).fragment)
            .toBe(compileShader({ shader: 'sprite2d', color: composerVec4(nested, 0, 0, 1) }).fragment);
    });

    it('builds mod from floor, so both backends agree on negative numbers', () => {
        const fragment = compileShader({ shader: 'sprite2d', color: composerVec4(composerMod(composerTime(), 3), 0, 0, 1) }).fragment!;

        expect(fragment).toContain('floor(');
        expect(fragment).not.toContain('%');
    });
});

describe('what it refuses', () => {
    it('a leaf read where it does not exist, naming the stage', () => {
        expect(() => compileShader({ shader: 'sprite2d', color: composerVec4(composerLight(), 1) }))
            .toThrow(/light is not available in a 2D colour graph/);
        expect(() => compileShader({ shader: 'mesh3d', position: composerLight() }))
            .toThrow(/light is not available in a model vertex/);
        expect(() => compileShader({ shader: 'mesh3d', color: composerFresnel(3) }))
            .toThrow(/"color" must be a vec3 or a vec4/);
    });

    it('a picture read in a vertex graph', () => {
        expect(() => compileShader({ shader: 'mesh3d', position: composerSwizzle(composerTextureSample(composerUv()), 'xyz') }))
            .toThrow(/textureSample is not available in a vertex graph/);
    });

    it('a sprite shader with a position, and one with no colour', () => {
        expect(() => compileShader({ shader: 'sprite2d', color: gradient(), position: composerVec3(0, 0, 0) }))
            .toThrow(/no vertex stage/);
        expect(() => compileShader({ shader: 'sprite2d' })).toThrow(/needs a "color"/);
        expect(() => compileShader({ shader: 'mesh3d' })).toThrow(/needs a "color", a "position" or both/);
    });

    it('a screen-wide effect, which no node can write yet', () => {
        // Refused by the type as well; this is for whoever calls it from plain JavaScript.
        // @ts-expect-error 'post' is not a family a graph can be for.
        expect(() => compileShader({ shader: 'post', color: gradient() })).toThrow(/screen-wide effect/);
    });

    it('a position that is not a vec3', () => {
        expect(() => compileShader({ shader: 'mesh3d', position: composerUv() })).toThrow(/"position" must be a vec3/);
    });

    it('operands of sizes that do not go together, while the graph is being built', () => {
        expect(() => composerAdd(composerUv(), composerVec3(1, 2, 3))).toThrow(/cannot "\+" a vec2<f32> with a vec3<f32>/);
        expect(() => composerVec3(composerUv(), composerUv())).toThrow(/vec3 needs 3 components/);
        expect(() => composerSwizzle(composerUv(), 'xz')).toThrow(/reads "z"/);
        expect(() => composerSwizzle(composerSurface(), 'xg')).toThrow(/cannot mix xyzw with rgba/);
        expect(() => composerClamp(composerUv(), composerVec3(0, 0, 0), 1)).toThrow(/expected a vec2<f32>/);
    });

    it('a parameter called the name of a value the engine writes itself', () => {
        expect(() => composerUniform('time', 1)).toThrow(/"time" is taken by the engine/);
        expect(() => composerUniform('resolution', [1, 1])).toThrow(/"resolution" is taken/);
    });

    it('a parameter whose value is not a number or a list of two to four', () => {
        expect(() => composerUniform('k', [1])).toThrow(/two, three or four/);
        expect(() => composerUniform('k', [1, 2, 3, 4, 5])).toThrow(/two, three or four/);
    });

    it('one parameter name used as two types', () => {
        const color = composerVec4(composerMul(composerUniform('k', 1), composerUniform('k', [1, 1, 1])), 1);

        expect(() => compileShader({ shader: 'sprite2d', color })).toThrow(/"k" is used as two different types/);
    });
});

describe('the GLSL half', () => {
    // Not compared with the WGSL string for string: the languages are not meant to look alike,
    // only to mean the same. What is compared is what each one has to get right.

    it('gives a shared local its type, where WGSL works it out', () => {
        const shared = composerMul(composerX(composerUv()), 4);
        const { fragment, fragmentGlsl } = compileShader({ shader: 'sprite2d', color: composerVec4(composerAdd(shared, shared), 0, 0, 1) });

        expect(fragment).toMatch(/let v0 = /);
        expect(fragmentGlsl).toMatch(/float v0 = /);
        expect(fragmentGlsl).not.toContain('let ');
    });

    it('reads each leaf the way the WebGL2 hooks offer it', () => {
        const sprite = compileShader({ shader: 'sprite2d', color: composerVec4(composerX(composerUv()), composerTime(), 0, 1) }).fragmentGlsl!;
        const model = compileShader({ shader: 'mesh3d', color: composerVec4(composerX(composerUv()), composerLight()) }).fragmentGlsl!;

        expect(sprite).toContain('(uv).x');
        expect(sprite).toContain('mu.time');
        expect(model).toContain('(ctx.uv).x');
        expect(model).toContain('ctx.light');
    });

    it('drops the generic from vector constructors', () => {
        const glsl = compileShader({ shader: 'sprite2d', color: gradient() }).fragmentGlsl!;

        expect(glsl).toContain('vec3(');
        expect(glsl).not.toContain('<f32>');
    });

    it('writes the GLSL signatures the engine calls', () => {
        expect(compileShader({ shader: 'sprite2d', color: gradient() }).fragmentGlsl).toContain('vec4 effect(vec4 color, vec2 uv)');
        expect(compileShader({ shader: 'mesh3d', color: gradient() }).fragmentGlsl).toContain('vec4 effect(vec4 surface, FragContext ctx)');
        expect(compileShader({ shader: 'mesh3d', position: composerVec3(0, composerMul(composerTime(), 0.5), 0) }).vertexGlsl)
            .toContain('vec3 vertex(vec3 pos, VertContext ctx)');
    });

    it('takes each helper in its own language, with the same set on both sides', () => {
        const { fragment, fragmentGlsl } = compileShader({ shader: 'sprite2d', color: composerVec4(composerFbm(composerUv(), 3), 0, 0, 1) });

        expect(fragment).toContain('fn sgFbm3o3(p: vec3<f32>) -> f32');
        expect(fragmentGlsl).toContain('float sgFbm3o3(vec3 p)');
        for (const name of ['sgHash13', 'sgNoise3', 'sgFbm3o3']) {
            expect(fragment).toContain(name);
            expect(fragmentGlsl).toContain(name);
        }
        expect(fragmentGlsl).not.toMatch(/\bvar\b/);
    });

    it('leaves no WGSL anywhere in a graph that uses every kind of value', () => {
        const glsl = compileShader({
            shader: 'sprite2d',
            color: composerVec4(
                composerClamp(
                    composerMix(composerSwizzle(composerSurface(), 'rgb'), composerVec3(composerSimplexNoise(composerUv()), 0, 1), composerUniform('amount', 0.5)),
                    0,
                    1,
                ),
                1,
            ),
        }).fragmentGlsl!;

        expect(glsl).not.toContain('<f32>');
        expect(glsl).not.toMatch(/^\s*let\s/m);
        expect(glsl).not.toMatch(/->/);
        expect(glsl).not.toMatch(/\bfn\s/);
    });
});
