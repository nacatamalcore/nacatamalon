import { describe, expect, it } from 'bun:test';
import { drawSpriteRun } from '../src/render/webgl2/sprite/draw_sprites';
import { createSpritePipeline } from '../src/render/webgl2/sprite/create_sprite_pipeline';
import type { TSpritePipeline } from '../src/render/webgl2/sprite/types/t_sprite_pipeline';
import type { TSpriteRun } from '../src/render/webgl2/sprite/types/t_sprite_run';

const fixture = () => {
    const calls: Array<{ name: string; args: unknown[] }> = [];
    const gl = new Proxy({ TEXTURE0: 10, TEXTURE_2D: 20, FLOAT: 30, TRIANGLE_STRIP: 40 }, {
        get: (target, name: string) => name in target ? target[name as keyof typeof target]
            : (...args: unknown[]) => calls.push({ name, args }),
    }) as unknown as WebGL2RenderingContext;
    const picture = {} as WebGLTexture;
    const sprites = {
        whiteTexture: {}, samplers: { nearest: {}, linear: {} },
        lit: { program: {}, distanceFieldProgram: {}, batchProgram: {}, batchDistanceFieldProgram: {} },
        unlit: { program: {}, distanceFieldProgram: {}, batchProgram: {}, batchDistanceFieldProgram: {} },
    } as unknown as TSpritePipeline;
    const run: TSpriteRun = {
        texture: picture, textures: [picture], sampler: sprites.samplers.nearest, material: null,
        distanceField: false, additive: false, uniforms: null, stencil: null, start: 0, firstDrawable: 0, count: 1,
    };
    return { gl, sprites, run, calls };
};

describe('WebGL2 picture bindings', () => {
    it('keeps singleton runs on the original one-picture path, including additive sprites and distance fields', () => {
        for (const fields of [{}, { additive: true }, { distanceField: true }]) {
            const { gl, sprites, run, calls } = fixture();
            drawSpriteRun(gl, sprites, { ...run, ...fields }, 0, 32, 32, true);
            expect(calls.some(c => c.name === 'useProgram' && [sprites.lit.batchProgram, sprites.lit.batchDistanceFieldProgram].includes(c.args[0] as WebGLProgram))).toBe(false);
            expect(calls.filter(c => c.name === 'bindTexture')).toHaveLength(1);
            expect(calls.filter(c => c.name === 'bindSampler')).toHaveLength(1);
        }
    });

    it('binds eight valid units only when a run actually combines pictures, then requests ordinary state again', () => {
        const { gl, sprites, run, calls } = fixture();
        const ready = drawSpriteRun(gl, sprites, { ...run, textures: [run.texture, {} as WebGLTexture] }, 0, 32, 32, true);
        expect(ready).toBe(false);
        expect(calls.filter(c => c.name === 'useProgram')).toEqual([{ name: 'useProgram', args: [sprites.lit.batchProgram] }]);
        expect(calls.filter(c => c.name === 'bindTexture')).toHaveLength(8);
        expect(calls.filter(c => c.name === 'bindSampler')).toHaveLength(8);
        expect(calls.filter(c => c.name === 'activeTexture').at(-1)?.args).toEqual([gl.TEXTURE0]);
    });

    it('leaves a custom material\'s map units alone and binds its main picture on unit zero', () => {
        const { gl, sprites, run, calls } = fixture();
        sprites.materials = {
            warnIfWgpuOnly: () => {}, get: () => ({ failed: false, program: {} }),
            bind: () => { gl.activeTexture(gl.TEXTURE0 + 4); },
        } as unknown as TSpritePipeline['materials'];
        drawSpriteRun(gl, sprites, { ...run, material: { fragment: 'effect', fragmentGlsl: 'effect' } as never }, 0, 32, 32, true);
        expect(calls.filter(c => c.name === 'bindTexture')).toHaveLength(1);
        expect(calls.filter(c => c.name === 'bindSampler')).toEqual([{ name: 'bindSampler', args: [0, run.sampler] }]);
        expect(calls.filter(c => c.name === 'activeTexture').at(-1)?.args).toEqual([gl.TEXTURE0]);
        expect(calls.some(c => c.name === 'useProgram' && c.args[0] === sprites.lit.batchProgram)).toBe(false);
    });

    it('draws a pass with no 2D lights with the programs that do not read them', () => {
        const { gl, sprites, run, calls } = fixture();
        drawSpriteRun(gl, sprites, { ...run, textures: [run.texture, {} as WebGLTexture] }, 0, 32, 32, false);
        drawSpriteRun(gl, sprites, { ...run, distanceField: true }, 0, 32, 32, false);
        expect(calls.filter(c => c.name === 'useProgram').map(c => c.args[0])).toEqual([sprites.unlit.batchProgram, sprites.unlit.distanceFieldProgram]);
    });
});

const compiler = (rejectBatch = false) => {
    let compilations = 0;
    let links = 0;
    const sources = new WeakMap<WebGLShader, string>();
    const gl = new Proxy({
        createShader: () => ({} as WebGLShader),
        shaderSource: (shader: WebGLShader, source: string) => sources.set(shader, source),
        compileShader: () => compilations++,
        getShaderParameter: (shader: WebGLShader) => !rejectBatch || !sources.get(shader)?.includes('spriteTexture1'),
        getShaderInfoLog: () => 'simulated driver rejection',
        createProgram: () => ({} as WebGLProgram),
        linkProgram: () => links++,
        getProgramParameter: () => true,
    }, {
        get: (target, name: string) => name in target ? target[name as keyof typeof target] : () => ({}),
    }) as unknown as WebGL2RenderingContext;
    return { gl, counts: () => ({ compilations, links }) };
};

describe('WebGL2 built-in sprite program lifetime', () => {
    it('compiles all four variants, lit and unlit, at creation and restoration, and compiles nothing while drawing', () => {
        const { gl, counts } = compiler();
        let previous: TSpritePipeline | undefined;
        for (let boot = 1; boot <= 2; boot++) {
            const sprites = createSpritePipeline(gl, {} as WebGLBuffer, false);
            expect(counts()).toEqual({ compilations: boot * 16, links: boot * 8 });
            const programs = [sprites.lit, sprites.unlit].flatMap(set => [set.program, set.distanceFieldProgram, set.batchProgram, set.batchDistanceFieldProgram]);
            expect(programs.every(program => typeof program === 'object' && program !== null)).toBe(true);
            expect(new Set(programs).size).toBe(8);
            if (previous !== undefined) {
                expect(sprites.lit.program).not.toBe(previous.lit.program);
                expect(sprites.unlit.program).not.toBe(previous.unlit.program);
                expect(sprites.lit.batchDistanceFieldProgram).not.toBe(previous.lit.batchDistanceFieldProgram);
            }
            const { run } = fixture();
            for (let frame = 0; frame < 3; frame++) {
                for (const distanceField of [false, true]) {
                    drawSpriteRun(gl, sprites, { ...run, distanceField, textures: [run.texture, {} as WebGLTexture] }, 0, 32, 32, frame % 2 === 0);
                }
            }
            expect(counts()).toEqual({ compilations: boot * 16, links: boot * 8 });
            previous = sprites;
        }
    });

    it('reports a rejected batch shader from creation, before any frame can start', () => {
        const { gl } = compiler(true);
        expect(() => createSpritePipeline(gl, {} as WebGLBuffer, false)).toThrow('sprite batch distance field fragment');
    });
});
