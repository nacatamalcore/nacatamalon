import { describe, expect, it } from 'bun:test';
import * as webgpuInstances from '../src/render/webgpu/sprite/write_sprite_instance';
import * as webgl2Instances from '../src/render/webgl2/sprite/write_sprite_instances';
import type { TSpritePipeline as TWebGPUSpritePipeline } from '../src/render/webgpu/sprite/types/t_sprite_pipeline';
import type { TSpritePipeline as TWebGL2SpritePipeline } from '../src/render/webgl2/sprite/types/t_sprite_pipeline';
import type { TDrawSprite } from '../src/render/interface';

/**
 * What a scene with no materials in it costs, which is nothing.
 *
 * The other material tests ask whether the new thing works. This one asks whether the old thing
 * still does, and it is the more valuable question: every 2D game that existed before any of this
 * was written goes down this path, and none of them will ever ask for an effect.
 *
 * So the numbers a sprite puts in the instance buffer are pinned here, **written out by hand rather
 * than compared against a second run of the same code**, which would only prove the code agrees with
 * itself. If a field moves, this fails and names the field.
 */

const nothing = (): unknown => new Proxy(() => ({}), { get: () => nothing() });

Object.assign(globalThis, { GPUBufferUsage: { VERTEX: 32, COPY_DST: 8 } });

const fakeDevice = nothing() as GPUDevice;
const fakeGl = nothing() as WebGL2RenderingContext;

const webgpuPipeline = (): TWebGPUSpritePipeline => ({
    pipeline: nothing() as GPURenderPipeline,
    layouts: nothing() as TWebGPUSpritePipeline['layouts'],
    materials: nothing() as TWebGPUSpritePipeline['materials'],
    quad: {} as GPUBuffer,
    bindGroup: {} as GPUBindGroup,
    instances: nothing() as GPUBuffer,
    instanceData: new Float32Array(webgpuInstances.INITIAL_SPRITE_CAPACITY * webgpuInstances.SPRITE_FLOATS),
    capacity: webgpuInstances.INITIAL_SPRITE_CAPACITY,
    samplers: { nearest: {} as GPUSampler, linear: {} as GPUSampler },
    defaultSmooth: false,
    whiteBindGroup: {} as GPUBindGroup,
    textureBindGroups: new WeakMap(),
    runs: [],
    runCount: 0,
});

const webgl2Pipeline = (): TWebGL2SpritePipeline => ({
    materials: nothing() as TWebGL2SpritePipeline['materials'],
    program: {} as WebGLProgram,
    vao: {} as WebGLVertexArrayObject,
    quad: {} as WebGLBuffer,
    instances: {} as WebGLBuffer,
    instanceData: new Float32Array(webgl2Instances.INITIAL_SPRITE_CAPACITY * webgl2Instances.SPRITE_FLOATS),
    capacity: webgl2Instances.INITIAL_SPRITE_CAPACITY,
    samplers: { nearest: {} as WebGLSampler, linear: {} as WebGLSampler },
    defaultSmooth: false,
    whiteTexture: {} as WebGLTexture,
    runs: [],
    runCount: 0,
});

/**
 * One sprite with every number picked so a field landing in the wrong slot cannot look right.
 */
const sprite: TDrawSprite = {
    type: 'sprite',
    transform: { x: 11, y: 22, rotation: 0.5, scaleX: 2, scaleY: 3 },
    texture: null,
    tint: { r: 0.25, g: 0.5, b: 0.75, a: 0.5 },
    width: 16,
    height: 32,
};

describe('a scene that never asks for an effect', () => {
    it('writes the same eighteen numbers per sprite it always did', () => {
        const gpu = webgpuPipeline();
        webgpuInstances.writeSpriteInstances(fakeDevice, gpu, [sprite], [-1]);

        const written = Array.from(gpu.instanceData.slice(0, webgpuInstances.SPRITE_FLOATS));

        // Place and size first, then the turn and the scale, then the colour, then the corner of the
        // sheet it reads. Spelled out, because the whole point is to notice a field moving.
        expect(written.slice(0, 4)).toEqual([11, 22, 16, 32]);
        expect(written.slice(4, 7)).toEqual([0.5, 2, 3]);
        expect(written.slice(7, 11)).toEqual([0.25, 0.5, 0.75, 0.5]);
        expect(webgpuInstances.SPRITE_FLOATS).toBe(18);
    });

    it('writes the very same numbers on the other card, to the last float', () => {
        const gpu = webgpuPipeline();
        const gl = webgl2Pipeline();
        webgpuInstances.writeSpriteInstances(fakeDevice, gpu, [sprite], [-1]);
        webgl2Instances.writeSpriteInstances(fakeGl, gl, [sprite], [-1]);

        expect(webgl2Instances.SPRITE_FLOATS).toBe(webgpuInstances.SPRITE_FLOATS);
        expect(Array.from(gl.instanceData.slice(0, webgl2Instances.SPRITE_FLOATS)))
            .toEqual(Array.from(gpu.instanceData.slice(0, webgpuInstances.SPRITE_FLOATS)));
    });

    it('leaves a screenful of them in one draw, carrying no material and no settings', () => {
        const many = Array.from({ length: 40 }, () => sprite);
        const gpu = webgpuPipeline();
        const gl = webgl2Pipeline();
        webgpuInstances.writeSpriteInstances(fakeDevice, gpu, many, many.map(() => -1));
        webgl2Instances.writeSpriteInstances(fakeGl, gl, many, many.map(() => -1));

        expect(gpu.runCount).toBe(1);
        expect(gl.runCount).toBe(1);
        // Not merely one run: a run that never mentions a material, so nothing downstream of here
        // can be tempted to bind one.
        expect(gpu.runs[0]!.material).toBeNull();
        expect(gpu.runs[0]!.uniforms).toBeNull();
        expect(gl.runs[0]!.material).toBeNull();
        expect(gl.runs[0]!.uniforms).toBeNull();
    });
});
