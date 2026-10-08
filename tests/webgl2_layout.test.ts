import { describe, expect, it } from 'bun:test';
import * as webgpuInstances from '../src/render/webgpu/sprite/write_sprite_instance';
import * as webgl2Instances from '../src/render/webgl2/sprite/write_sprite_instances';
import * as webgpuUniforms from '../src/render/webgpu/frame/write_frame_uniforms';
import * as webgl2Uniforms from '../src/render/webgl2/frame/write_frame_uniforms';
import type { TDrawCamera2d, TDrawSprite, TDrawTexture } from '../src/render/interface';
import type { TSpritePipeline as TWebGPUSpritePipeline } from '../src/render/webgpu/sprite/types/t_sprite_pipeline';
import type { TSpritePipeline as TWebGL2SpritePipeline } from '../src/render/webgl2/sprite/types/t_sprite_pipeline';
import type { TWebGPUState } from '../src/render/webgpu/types/t_webgpu_state';
import type { TWebGL2State } from '../src/render/webgl2/types/t_webgl2_state';

/**
 * The WebGL2 backend keeps its own copy of the per-sprite layout and of the frame uniforms, on
 * purpose. These tests are what holds the two copies together: the same drawables go through both,
 * and the floats that come out must be the same, one by one.
 *
 * Neither GPU is real. Every call into a device or a context does nothing, and only the CPU side,
 * the numbers that would be uploaded, is compared.
 */

/**
 * Anything asked of it is a function that does nothing and returns an empty object.
 */
const nothing = (): unknown => new Proxy(() => ({}), { get: () => nothing() });

// Read by WebGPU when its instance buffer grows; only the names matter here, not the values.
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

/**
 * A texture both backends can read: the handle carries a WebGPU texture and a WebGL2 one.
 */
const texture = (status: TDrawTexture['status'], width = 64, height = 32): TDrawTexture => ({
    status,
    width,
    height,
    gpu: status === 'ready'
        ? ({ resourceType: 'texture', gpuTexture: nothing(), glTexture: {}, image: {} } as unknown as TDrawTexture['gpu'])
        : null,
});

const sprite = (fields: Partial<TDrawSprite> = {}): TDrawSprite => ({
    type: 'sprite',
    transform: { x: 10, y: 20, rotation: 0.5, scaleX: 2, scaleY: -1 },
    texture: null,
    tint: { r: 0.25, g: 0.5, b: 0.75, a: 0.8 },
    ...fields,
});

/**
 * Writes through both backends and returns what each would upload.
 */
const writeBoth = (drawables: TDrawSprite[], cameraIndex: number[]) => {
    const gpuPipeline = webgpuPipeline();
    const glPipeline = webgl2Pipeline();
    const gpuCount = webgpuInstances.writeSpriteInstances(fakeDevice, gpuPipeline, drawables, cameraIndex);
    const glCount = webgl2Instances.writeSpriteInstances(fakeGl, glPipeline, drawables, cameraIndex);
    return {
        gpuCount,
        glCount,
        gpu: Array.from(gpuPipeline.instanceData.subarray(0, gpuCount * webgpuInstances.SPRITE_FLOATS)),
        gl: Array.from(glPipeline.instanceData.subarray(0, glCount * webgl2Instances.SPRITE_FLOATS)),
        gpuRuns: gpuPipeline.runs.slice(0, gpuPipeline.runCount).map(({ start, count }) => ({ start, count })),
        glRuns: glPipeline.runs.slice(0, glPipeline.runCount).map(({ start, count }) => ({ start, count })),
    };
};

describe('WebGL2 and WebGPU write the same numbers', () => {
    it('share the constants', () => {
        expect(webgl2Instances.SPRITE_FLOATS).toBe(webgpuInstances.SPRITE_FLOATS);
        expect(webgl2Instances.MAX_VIEWS).toBe(webgpuInstances.MAX_VIEWS);
        expect(webgl2Uniforms.FRAME_UNIFORM_FLOATS).toBe(webgpuUniforms.FRAME_UNIFORM_FLOATS);
    });

    it('write every sprite field in the same place', () => {
        const atlas = texture('ready', 128, 64);
        const drawables = [
            sprite(),
            sprite({ width: 30, height: 40, anchor: { x: 0, y: 1 } }),
            sprite({ texture: atlas, uvOffset: { x: 0.25, y: 0.5 }, uvScale: { x: 0.25, y: 0.5 } }),
            sprite({ texture: atlas, smooth: true }),
            // Mirrored, which lives in the window into the sheet and not in the placement.
            sprite({ texture: atlas, uvOffset: { x: 0.25, y: 0 }, uvScale: { x: 0.25, y: 1 }, flipX: true }),
            sprite({ texture: atlas, flipX: true, flipY: true }),
            sprite({ texture: texture('error') }),
        ];
        const result = writeBoth(drawables, [-1, 0, 3, 14, 20, 0, 1]);

        expect(result.glCount).toBe(7);
        expect(result.gl).toEqual(result.gpu);
    });

    it('skip a loading texture the same way', () => {
        const drawables = [sprite(), sprite({ texture: texture('loading') }), sprite({ transform: { x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } })];
        const result = writeBoth(drawables, [-1, -1, 0]);

        expect(result.glCount).toBe(2);
        expect(result.gpuCount).toBe(2);
        expect(result.gl).toEqual(result.gpu);
    });

    it('cut runs at the same places', () => {
        const a = texture('ready');
        const b = texture('ready');
        const drawables = [
            sprite({ texture: a }),
            sprite({ texture: a }),
            sprite({ texture: b }),
            sprite({ texture: a }),
            sprite({ texture: a, smooth: true }),
            sprite(),
            sprite(),
        ];
        const result = writeBoth(drawables, drawables.map(() => -1));

        expect(result.glRuns).toEqual(result.gpuRuns);
        expect(result.glRuns).toEqual([
            { start: 0, count: 2 },
            { start: 2, count: 1 },
            { start: 3, count: 1 },
            { start: 4, count: 1 },
            { start: 5, count: 2 },
        ]);
    });

    it('grow past the first capacity and keep writing the same', () => {
        const drawables = Array.from({ length: 200 }, (_, i) => sprite({ transform: { x: i, y: -i, rotation: i / 10, scaleX: 1, scaleY: 1 } }));
        const result = writeBoth(drawables, drawables.map((_, i) => (i % 3) - 1));

        expect(result.glCount).toBe(200);
        expect(result.gl).toEqual(result.gpu);
    });

    it('write the same frame uniforms', () => {
        const cameras: TDrawCamera2d[] = [
            { transform: { x: 100, y: -50, rotation: 0.3 }, zoom: 2 },
            { transform: { x: 0, y: 0, rotation: 0 }, zoom: 0.5 },
        ];
        const gpuState = { device: fakeDevice, frameUniforms: { data: new Float32Array(webgpuUniforms.FRAME_UNIFORM_FLOATS), buffer: {} } } as unknown as TWebGPUState;
        const glState = { gl: fakeGl, frameUniforms: { data: new Float32Array(webgl2Uniforms.FRAME_UNIFORM_FLOATS), buffer: {} } } as unknown as TWebGL2State;

        webgpuUniforms.writeFrameUniforms(gpuState, 480, 270, cameras);
        webgl2Uniforms.writeFrameUniforms(glState, 480, 270, cameras);

        expect(Array.from(glState.frameUniforms.data)).toEqual(Array.from(gpuState.frameUniforms.data));
    });
});
