import { describe, expect, it } from 'bun:test';
import { drawTilemapLayer, reserveLayerSlots } from '../src/render/webgpu/tilemap/draw_tilemaps';
import { LAYER_STRIDE } from '../src/render/webgpu/tilemap/create_tilemap_pipeline';
import type { TTilemapPipeline } from '../src/render/webgpu/tilemap/types/t_tilemap_pipeline';
import type { TDrawTilemapLayer } from '../src/render/interface';

/**
 * A frame with more map layers than the shared buffer holds, which used to grow it in the middle
 * of the pass and leave the layers already recorded pointing at a buffer that was gone.
 */

Object.assign(globalThis, { GPUBufferUsage: { UNIFORM: 64, COPY_DST: 8 } });

type TFakeBuffer = { size: number; destroyed: boolean; destroy: () => void };

const fakeDevice = (log: string[]): GPUDevice => ({
    createBuffer: (descriptor: GPUBufferDescriptor): TFakeBuffer => {
        log.push('grow');
        const buffer: TFakeBuffer = { size: descriptor.size, destroyed: false, destroy: () => {
            buffer.destroyed = true;
        } };
        return buffer;
    },
    createBindGroup: (descriptor: GPUBindGroupDescriptor) => descriptor,
    queue: { writeBuffer: () => undefined },
}) as unknown as GPUDevice;

const fakePass = (log: string[], groups: GPUBindGroupDescriptor[]): GPURenderPassEncoder => ({
    setPipeline: () => undefined,
    setBindGroup: (index: number, group: GPUBindGroupDescriptor) => {
        if (index === 2) {
            groups.push(group);
        }
    },
    setVertexBuffer: () => undefined,
    draw: () => log.push('draw'),
}) as unknown as GPURenderPassEncoder;

const pipeline = (): TTilemapPipeline => {
    const first: TFakeBuffer = { size: 8 * LAYER_STRIDE, destroyed: false, destroy: () => {
        first.destroyed = true;
    } };
    return {
        layouts: { frame: {}, texture: {}, layer: {} } as TTilemapPipeline['layouts'],
        materials: {} as TTilemapPipeline['materials'],
        pipeline: {} as GPURenderPipeline,
        frameBindGroup: {} as GPUBindGroup,
        textureBindGroups: new WeakMap(),
        samplers: { nearest: {} as GPUSampler, linear: {} as GPUSampler },
        defaultSmooth: false,
        layerUniforms: { buffer: first as unknown as GPUBuffer, data: new Float32Array(8 * LAYER_STRIDE / 4), capacity: 8 },
        layerBindGroups: [],
    };
};

const layer = (): TDrawTilemapLayer => ({
    type: 'tilemap',
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    meshes: [{ buffer: { gpuBuffer: {} } as never, vertexCount: 6 }],
    texture: { status: 'ready', gpu: { gpuTexture: { createView: () => ({}) } } as never, width: 16, height: 16 },
    tint: { r: 1, g: 1, b: 1, a: 1 },
});

/**
 * One frame the way the renderer runs it: the room made first, then every layer drawn in its slot.
 */
const drawFrame = (tilemaps: TTilemapPipeline, layers: number) => {
    const log: string[] = [];
    const groups: GPUBindGroupDescriptor[] = [];
    const device = fakeDevice(log);
    reserveLayerSlots(device, tilemaps, layers);
    const pass = fakePass(log, groups);
    for (let slot = 0; slot < layers; slot++) {
        drawTilemapLayer(device, pass, tilemaps, layer(), -1, slot, 0, 320, 240);
    }
    const pointedAt = groups.map(group => ((group.entries as GPUBindGroupEntry[])[0].resource as GPUBufferBinding).buffer);
    return { log, pointedAt };
};

describe('the room for a frame of map layers', () => {
    it('is made before the first layer is drawn, so every layer points at a buffer that is still there', () => {
        const tilemaps = pipeline();
        const { log, pointedAt } = drawFrame(tilemaps, 20);

        expect(log.indexOf('grow')).toBe(0);
        expect(log.lastIndexOf('grow')).toBe(0);
        expect(log.filter(entry => entry === 'draw')).toHaveLength(20);
        expect(tilemaps.layerUniforms.capacity).toBe(32);
        expect(pointedAt).toHaveLength(20);
        for (const buffer of pointedAt) {
            expect(buffer).toBe(tilemaps.layerUniforms.buffer);
            expect((buffer as unknown as TFakeBuffer).destroyed).toBe(false);
        }
    });

    it('is left alone while the layers fit', () => {
        const tilemaps = pipeline();
        const before = tilemaps.layerUniforms.buffer;
        const { log } = drawFrame(tilemaps, 8);

        expect(log).not.toContain('grow');
        expect(tilemaps.layerUniforms.buffer).toBe(before);
        expect(tilemaps.layerUniforms.capacity).toBe(8);
    });

    it('grows once and then stays, frame after frame', () => {
        const tilemaps = pipeline();
        drawFrame(tilemaps, 9);
        const grown = tilemaps.layerUniforms.buffer;
        const { log, pointedAt } = drawFrame(tilemaps, 9);

        expect(log).not.toContain('grow');
        expect(tilemaps.layerUniforms.buffer).toBe(grown);
        expect(pointedAt.every(buffer => buffer === grown)).toBe(true);
    });
});
