import { describe, expect, it } from 'bun:test';
import * as webgpuInstances from '../src/render/webgpu/sprite/write_sprite_instance';
import * as webgl2Instances from '../src/render/webgl2/sprite/write_sprite_instances';
import type { TSpritePipeline as TWebGPUSpritePipeline } from '../src/render/webgpu/sprite/types/t_sprite_pipeline';
import type { TSpritePipeline as TWebGL2SpritePipeline } from '../src/render/webgl2/sprite/types/t_sprite_pipeline';
import type { TDrawItem, TDrawParticles, TDrawSprite } from '../src/render/interface';

/**
 * What a scene with no emitters costs, which has to be nothing, and what one emitter costs the
 * sprites around it, which has to be one cut in the batch and no more.
 */

const nothing = (): unknown => new Proxy(() => ({}), { get: () => nothing() });

Object.assign(globalThis, { GPUBufferUsage: { VERTEX: 32, COPY_DST: 8 } });

const fakeDevice = nothing() as GPUDevice;
const fakeGl = nothing() as WebGL2RenderingContext;

const webgpuPipeline = (): TWebGPUSpritePipeline => ({
    pipeline: nothing() as GPURenderPipeline,
    distanceFieldPipeline: nothing() as GPURenderPipeline,
    layouts: nothing() as TWebGPUSpritePipeline['layouts'],
    materials: nothing() as TWebGPUSpritePipeline['materials'],
    distanceFieldMaterials: nothing() as TWebGPUSpritePipeline['materials'],
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
    distanceFieldMaterials: nothing() as TWebGL2SpritePipeline['materials'],
    program: {} as WebGLProgram,
    distanceFieldProgram: {} as WebGLProgram,
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

const sprite = (): TDrawSprite => ({
    type: 'sprite',
    transform: { x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 },
    texture: null,
    tint: { r: 1, g: 1, b: 1, a: 1 },
    width: 8,
    height: 8,
});

const emitter = (): TDrawParticles => ({
    type: 'particles',
    instances: new Float32Array(0),
    count: 0,
    texture: null,
    blend: 'alpha',
});

const runsFor = (drawables: TDrawItem[]): { webgpu: number; webgl2: number } => {
    const gpu = webgpuPipeline();
    const gl = webgl2Pipeline();
    const cameras = drawables.map(() => -1);
    webgpuInstances.writeSpriteInstances(fakeDevice, gpu, drawables as TDrawSprite[], cameras);
    webgl2Instances.writeSpriteInstances(fakeGl, gl, drawables as TDrawSprite[], cameras);
    return { webgpu: gpu.runCount, webgl2: gl.runCount };
};

describe('a scene with no emitters in it', () => {
    it('writes exactly the sprite instances it always did', () => {
        const gpu = webgpuPipeline();
        const written = webgpuInstances.writeSpriteInstances(fakeDevice, gpu, [sprite(), sprite()], [-1, -1]);

        expect(written).toBe(2);
        expect(Array.from(gpu.instanceData.slice(0, 4))).toEqual([1, 2, 8, 8]);
    });

    it('leaves a screenful of them in one draw', () => {
        expect(runsFor([sprite(), sprite(), sprite(), sprite()])).toEqual({ webgpu: 1, webgl2: 1 });
    });
});

describe('one emitter among sprites', () => {
    it('cuts the batch where it stands, and nowhere else', () => {
        // An emitter is its own draw with its own pipeline, so the sprites on either side find each
        // other again rather than every sprite becoming a draw of its own.
        expect(runsFor([sprite(), sprite(), emitter(), sprite(), sprite()]))
            .toEqual({ webgpu: 2, webgl2: 2 });
    });

    it('is counted the same way by both backends, whatever the order', () => {
        const mixed = [sprite(), emitter(), sprite(), emitter(), emitter(), sprite()];
        const counts = runsFor(mixed);

        expect(counts.webgpu).toBe(counts.webgl2);
    });
});
