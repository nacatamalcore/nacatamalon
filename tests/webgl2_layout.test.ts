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
import type { TDrawStencil } from '../src/render/interface/draw/t_draw_stencil';
import type { TDrawShader } from '../src/render/interface/draw/t_draw_material';

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
    additivePipeline: nothing() as GPURenderPipeline,
    additiveDistanceFieldPipeline: nothing() as GPURenderPipeline,
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
    whiteTexture: { createView: () => ({}) } as unknown as GPUTexture,
    textureBindGroups: new WeakMap(),
    runsByPass: [],
    runs: [],
    runCount: 0,
});

const webgl2Pipeline = (): TWebGL2SpritePipeline => ({
    materials: nothing() as TWebGL2SpritePipeline['materials'],
    distanceFieldMaterials: nothing() as TWebGL2SpritePipeline['materials'],
    program: {} as WebGLProgram,
    distanceFieldProgram: {} as WebGLProgram,
    batchProgram: {} as WebGLProgram,
    batchDistanceFieldProgram: {} as WebGLProgram,
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
const writeBoth = (drawables: TDrawSprite[], cameraIndex: number[], stencils: TDrawStencil[] | null = null) => {
    const gpuPipeline = webgpuPipeline();
    const glPipeline = webgl2Pipeline();
    const gpuCount = webgpuInstances.writeSpriteInstances(fakeDevice, gpuPipeline, drawables, cameraIndex, stencils);
    const glCount = webgl2Instances.writeSpriteInstances(fakeGl, glPipeline, drawables, cameraIndex, stencils);
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
            // Turned about a point that is not its anchor: both move it there alike.
            sprite({ width: 30, height: 40, anchor: { x: 0, y: 1 }, pivot: { x: 0.5, y: 0.5 } }),
            sprite({ texture: atlas, uvOffset: { x: 0.25, y: 0.5 }, uvScale: { x: 0.25, y: 0.5 } }),
            sprite({ texture: atlas, smooth: true }),
            // Mirrored, which lives in the window into the sheet and not in the placement.
            sprite({ texture: atlas, uvOffset: { x: 0.25, y: 0 }, uvScale: { x: 0.25, y: 1 }, flipX: true }),
            sprite({ texture: atlas, flipX: true, flipY: true }),
            sprite({ texture: texture('error') }),
        ];
        const result = writeBoth(drawables, [-1, 0, 0, 3, 14, 20, 0, 1]);

        expect(result.glCount).toBe(8);
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
            { start: 0, count: 4 },
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

describe('several pictures in an ordered sprite batch', () => {
    it('keeps each pass\'s groups when several passes are drawn every frame', () => {
        const pipeline = webgpuPipeline();
        let groups = 0;
        const device = { queue: { writeBuffer: () => {} }, createBindGroup: () => ({ id: ++groups }) } as unknown as GPUDevice;
        const pictures = Array.from({ length: 6 }, () => sprite({ texture: texture('ready') }));
        const originals: GPUBindGroup[] = [];
        for (let frame = 0; frame < 20; frame++) {
            const passes = [pictures.slice(0, 2), pictures.slice(2, 4), pictures.slice(4, 6)];
            passes.forEach((drawables, index) => {
                webgpuInstances.writeSpriteInstances(device, pipeline, drawables, [-1, -1], null, index);
                if (frame === 0) originals[index] = pipeline.runs[0].bindGroup;
                expect(pipeline.runs[0].bindGroup).toBe(originals[index]);
            });
            webgpuInstances.endSpriteFrame(pipeline, passes.length);
        }
        expect(groups).toBe(3);
        expect(pipeline.runsByPass).toHaveLength(3);
        expect(new Set(originals).size).toBe(3);
    });

    it('lets go of the batches of passes not drawn for a while, and of their pictures, but keeps the passes\' lists', () => {
        const pipeline = webgpuPipeline();
        let groups = 0;
        const device = { queue: { writeBuffer: () => {} }, createBindGroup: () => ({ id: ++groups }) } as unknown as GPUDevice;
        const pictures = Array.from({ length: 16 }, () => sprite({ texture: texture('ready') }));
        const write = (items: TDrawSprite[], pass: number) => webgpuInstances.writeSpriteInstances(device, pipeline, items, items.map(() => -1), null, pass);
        write(pictures, 0);
        const spare = pipeline.runs[1];
        write(pictures.slice(0, 2), 1);
        const removedPass = pipeline.runsByPass[1];
        const removedRun = removedPass[0];
        webgpuInstances.endSpriteFrame(pipeline, 2);
        expect(groups).toBe(3);
        for (let frame = 0; frame < webgpuInstances.SPARE_SPRITE_FRAMES; frame++) {
            write(pictures.slice(0, 8), 0);
            webgpuInstances.endSpriteFrame(pipeline, 1);
            if (frame === 0) {
                expect(pipeline.runs[1]).toBe(spare);
                expect(spare.count).toBe(0);
                expect(spare.textures).toHaveLength(1);
                expect(spare.textures[0]).toBe(pipeline.whiteTexture);
                expect(spare.bindGroup).toBe(pipeline.whiteBindGroup);
                expect(spare.batchBindGroup).toBeDefined();
            }
        }
        // The pass's list stays, empty, for when it comes back.
        expect(pipeline.runsByPass).toHaveLength(2);
        expect(pipeline.runsByPass[1]).toBe(removedPass);
        expect(pipeline.runs).toHaveLength(1);
        expect(spare.batchBindGroup).toBeUndefined();
        expect(spare.boundTextures).toBeUndefined();
        expect(removedRun.batchBindGroup).toBeUndefined();
        expect(removedRun.boundTextures).toBeUndefined();
        expect(removedPass).toHaveLength(0);
        expect(groups).toBe(3);
        for (let frame = 0; frame < webgpuInstances.SPARE_SPRITE_FRAMES; frame++) webgpuInstances.endSpriteFrame(pipeline, 0);
        expect(pipeline.runsByPass.map(runs => runs.length)).toEqual([0, 0]);
        expect(pipeline.runs).toHaveLength(0);
        expect(pipeline.runCount).toBe(0);
    });

    for (const total of [9, 10]) {
        it(total === 9
            ? 'reuses the record of a last batch of one picture that blinks'
            : 'reuses the record, group and views of a last batch of several pictures that blinks', () => {
            const pipeline = webgpuPipeline();
            let groups = 0;
            let views = 0;
            const gpuTexture = () => ({ createView: () => { views++; return {}; } }) as unknown as GPUTexture;
            pipeline.whiteTexture = gpuTexture();
            const device = { queue: { writeBuffer: () => {} }, createBindGroup: () => ({ id: ++groups }) } as unknown as GPUDevice;
            const pictures = Array.from({ length: total }, () => {
                const picture = texture('ready');
                (picture.gpu as unknown as { gpuTexture: GPUTexture }).gpuTexture = gpuTexture();
                return sprite({ texture: picture });
            });
            const write = (items: TDrawSprite[]) => {
                webgpuInstances.writeSpriteInstances(device, pipeline, items, items.map(() => -1));
                webgpuInstances.endSpriteFrame(pipeline, 1);
            };
            write(pictures);
            const record = pipeline.runs[1];
            const slots = record.textures;
            const group = record.bindGroup;
            const warmViews = views;
            for (let cycle = 0; cycle < 12; cycle++) {
                const hiddenFor = [1, 30, webgpuInstances.SPARE_SPRITE_FRAMES - 1][cycle % 3];
                for (let frame = 0; frame < hiddenFor; frame++) write(pictures.slice(0, 8));
                expect(pipeline.runCount).toBe(1);
                write(pictures);
                expect(pipeline.runCount).toBe(2);
                expect(pipeline.runs[1]).toBe(record);
                expect(record.textures).toBe(slots);
                expect(record.bindGroup).toBe(group);
            }
            expect(groups).toBe(2);
            expect(views).toBe(warmViews);
        });
    }

    it('reuses a pass that skips a frame, and builds again only once when two passes swap places', () => {
        const pipeline = webgpuPipeline();
        let groups = 0;
        const device = { queue: { writeBuffer: () => {} }, createBindGroup: () => ({ id: ++groups }) } as unknown as GPUDevice;
        const a = [sprite({ texture: texture('ready') }), sprite({ texture: texture('ready') })];
        const b = [sprite({ texture: texture('ready') }), sprite({ texture: texture('ready') })];
        const write = (items: TDrawSprite[], pass: number) => webgpuInstances.writeSpriteInstances(device, pipeline, items, [-1, -1], null, pass);
        write(a, 0);
        write(b, 1);
        const saved = pipeline.runsByPass[1];
        const group = saved[0].bindGroup;
        for (let frame = 0; frame < 20; frame++) {
            write(a, 0);
            webgpuInstances.endSpriteFrame(pipeline, 1);
            write(a, 0);
            write(b, 1);
            webgpuInstances.endSpriteFrame(pipeline, 2);
            expect(pipeline.runsByPass[1]).toBe(saved);
            expect(saved[0].bindGroup).toBe(group);
        }
        expect(groups).toBe(2);
        // Now the two passes are drawn the other way round.
        for (let frame = 0; frame < 5; frame++) {
            write(b, 0);
            write(a, 1);
            webgpuInstances.endSpriteFrame(pipeline, 2);
        }
        expect(groups).toBe(4);
    });

    it('keeps a run\'s group of several pictures a while after it goes back to one, then lets go of it', () => {
        const pipeline = webgpuPipeline();
        let groups = 0;
        const device = { queue: { writeBuffer: () => {} }, createBindGroup: () => ({ id: ++groups }) } as unknown as GPUDevice;
        const pictures = Array.from({ length: 3 }, () => sprite({ texture: texture('ready') }));
        const write = (items: TDrawSprite[]) => {
            webgpuInstances.writeSpriteInstances(device, pipeline, items, items.map(() => -1));
            webgpuInstances.endSpriteFrame(pipeline, 1);
        };
        write(pictures);
        const run = pipeline.runs[0];
        const group = run.batchBindGroup!;
        expect(group).toBeDefined();
        // Several pictures and one in turn, never apart for two seconds: the same group every time.
        for (let frame = 0; frame < 50; frame++) {
            for (let alone = 0; alone < webgpuInstances.SPARE_SPRITE_FRAMES - 1; alone++) write(pictures.slice(0, 1));
            expect(run.batchBindGroup).toBe(group);
            write(pictures);
            expect(run.bindGroup).toBe(group);
        }
        const before = groups;
        for (let alone = 0; alone < webgpuInstances.SPARE_SPRITE_FRAMES; alone++) write(pictures.slice(0, 1));
        expect(pipeline.runs[0]).toBe(run);
        expect(run.batchBindGroup).toBeUndefined();
        expect(run.boundTextures).toBeUndefined();
        expect(groups).toBe(before);
    });

    it('keeps the list of a pass with no sprites that is drawn one frame and not the next', () => {
        const pipeline = webgpuPipeline();
        const device = { queue: { writeBuffer: () => {} }, createBindGroup: () => ({}) } as unknown as GPUDevice;
        const picture = [sprite({ texture: texture('ready') })];
        webgpuInstances.writeSpriteInstances(device, pipeline, picture, [-1], null, 0);
        webgpuInstances.writeSpriteInstances(device, pipeline, [], [], null, 1);
        webgpuInstances.endSpriteFrame(pipeline, 2);
        const empty = pipeline.runsByPass[1];
        for (let frame = 0; frame < 300; frame++) {
            webgpuInstances.writeSpriteInstances(device, pipeline, picture, [-1], null, 0);
            if (frame % 2 === 0) webgpuInstances.writeSpriteInstances(device, pipeline, [], [], null, 1);
            webgpuInstances.endSpriteFrame(pipeline, frame % 2 === 0 ? 2 : 1);
            expect(pipeline.runsByPass[1]).toBe(empty);
        }
    });

    it('draws alternating pictures together and retains all sixteen camera slots in the same instance bytes', () => {
        const pictures = Array.from({ length: 8 }, () => texture('ready'));
        const drawables = Array.from({ length: 1000 }, (_, i) => sprite({ texture: pictures[i % 8] }));
        const cameras = drawables.map((_, i) => i % 16 - 1);
        const result = writeBoth(drawables, cameras);
        expect(result.gpuRuns).toEqual([{ start: 0, count: 1000 }]);
        expect(result.glRuns).toEqual(result.gpuRuns);
        expect(result.gl).toEqual(result.gpu);
        for (let i = 0; i < drawables.length; i++) {
            expect(result.gpu[i * webgpuInstances.SPRITE_FLOATS + 17]).toBe(i % 16 + (i % 8) * 16);
        }
    });

    it('can reuse a picture after all eight slots are full and starts a fresh batch for a ninth', () => {
        const pictures = Array.from({ length: 9 }, () => texture('ready'));
        const drawables = [...pictures.slice(0, 8), pictures[0], pictures[1], pictures[8], pictures[0]].map(texture => sprite({ texture }));
        const result = writeBoth(drawables, drawables.map(() => -1));
        expect(result.gpuRuns).toEqual([{ start: 0, count: 10 }, { start: 10, count: 2 }]);
        expect(result.glRuns).toEqual(result.gpuRuns);
        expect(result.gl).toEqual(result.gpu);
        expect(result.gpu[10 * webgpuInstances.SPRITE_FLOATS + 17]).toBe(0);
        expect(result.gpu[11 * webgpuInstances.SPRITE_FLOATS + 17]).toBe(16);
    });

    it('leaves custom materials on their own main picture and does not encode a selector in their camera', () => {
        const a = texture('ready'), b = texture('ready');
        const material = { fragment: 'an effect' } as TDrawShader;
        const result = writeBoth([sprite({ texture: a, material }), sprite({ texture: b, material }), sprite({ texture: a, material })], [2, 2, 2]);
        expect(result.gpuRuns).toEqual([{ start: 0, count: 1 }, { start: 1, count: 1 }, { start: 2, count: 1 }]);
        expect(result.glRuns).toEqual(result.gpuRuns);
        expect([0, 1, 2].map(i => result.gpu[i * webgpuInstances.SPRITE_FLOATS + 17])).toEqual([3, 3, 3]);
    });

    it('keeps a model between sprites even if they could share a batch', () => {
        const drawables = [sprite({ texture: texture('ready') }), { type: 'mesh' }, sprite({ texture: texture('ready') })] as TDrawSprite[];
        const result = writeBoth(drawables, [-1, -1, -1]);
        expect(result.gpuRuns).toEqual([{ start: 0, count: 1 }, { start: 1, count: 1 }]);
        expect(result.glRuns).toEqual(result.gpuRuns);
    });

    it('cuts the batch at each stencil change and never joins across it', () => {
        const a = { write: 'none' } as TDrawStencil, b = { write: 'none' } as TDrawStencil;
        const drawables = Array.from({ length: 4 }, () => sprite({ texture: texture('ready') }));
        const result = writeBoth(drawables, [-1, -1, -1, -1], [a, a, b, a]);
        expect(result.gpuRuns).toEqual([{ start: 0, count: 2 }, { start: 2, count: 1 }, { start: 3, count: 1 }]);
        expect(result.glRuns).toEqual(result.gpuRuns);
    });

    it('keeps stencil shapes on their single-picture shader with an unpacked camera', () => {
        const shape = { write: 'add' } as TDrawStencil;
        const drawables = [sprite({ texture: texture('ready') }), sprite({ texture: texture('ready') })];
        const result = writeBoth(drawables, [2, 2], [shape, shape]);
        expect(result.gpuRuns).toEqual([{ start: 0, count: 1 }, { start: 1, count: 1 }]);
        expect(result.glRuns).toEqual(result.gpuRuns);
        expect(result.gpu[17]).toBe(3);
        expect(result.gpu[webgpuInstances.SPRITE_FLOATS + 17]).toBe(3);
    });

    it('reuses an unchanged immutable group and replaces it when the picture order or filter changes', () => {
        const pipeline = webgpuPipeline();
        let groups = 0;
        const device = { queue: { writeBuffer: () => {} }, createBindGroup: () => ({ id: ++groups }) } as unknown as GPUDevice;
        const a = sprite({ texture: texture('ready') }), b = sprite({ texture: texture('ready') });
        const write = (items: TDrawSprite[]) => {
            webgpuInstances.writeSpriteInstances(device, pipeline, items, items.map(() => -1));
            return pipeline.runs[0].bindGroup;
        };
        const original = write([a, b]);
        expect(write([a, b])).toBe(original);
        expect(groups).toBe(1);
        expect(write([b, a])).not.toBe(original);
        const swapped = pipeline.runs[0].bindGroup;
        write([a]);
        expect(write([b, a])).toBe(swapped);
        expect(write([{ ...b, smooth: true }, { ...a, smooth: true }])).not.toBe(swapped);
        // An earlier pass keeps its own group and its original picture order.
        expect(original).not.toBe(pipeline.runs[0].bindGroup);
    });
});
