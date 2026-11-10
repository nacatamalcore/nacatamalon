import { describe, expect, it } from 'bun:test';
import { readWebGPUTexture } from '../src/render/webgpu/resources/read_texture';
import type { ITexture } from '../src/render/interface';

/**
 * Bringing a picture back from the graphics card on WebGPU.
 *
 * The pixels travel through a buffer made for the trip, and that buffer is given back whether the
 * trip works or not: a capture that fails (the device lost while it waits) must not leave it behind.
 */

// The card's numbers, which a test runner does not have.
(globalThis as Record<string, unknown>).GPUBufferUsage ??= { COPY_DST: 8, MAP_READ: 1 };
(globalThis as Record<string, unknown>).GPUMapMode ??= { READ: 1 };

/** A card whose buffer answers `mapAsync` with `bytes`, or refuses when there are none. */
const fakeDevice = (bytes: Uint8Array | null) => {
    const staging = {
        destroyed: 0,
        mapAsync: () => (bytes === null ? Promise.reject(new Error('Device lost')) : Promise.resolve()),
        getMappedRange: () => bytes!.buffer,
        unmap: () => {},
        destroy() { this.destroyed++; },
    };
    const device = {
        createBuffer: () => staging,
        createCommandEncoder: () => ({ copyTextureToBuffer: () => {}, finish: () => ({}) }),
        queue: { submit: () => {} },
    };
    return { device: device as unknown as GPUDevice, staging };
};

const pictureOf = (width: number, height: number, format: string): ITexture =>
    ({ gpuTexture: { width, height, format } }) as unknown as ITexture;

describe('readWebGPUTexture', () => {
    it('trims the padding of each row, swaps blue and red back, and gives the buffer back', async () => {
        // Two pixels wide, so each row of 8 bytes is padded to 256.
        const bytes = new Uint8Array(256 * 2);
        bytes.set([1, 2, 3, 4, 5, 6, 7, 8], 0);
        bytes.set([9, 10, 11, 12, 13, 14, 15, 16], 256);
        const { device, staging } = fakeDevice(bytes);

        const result = await readWebGPUTexture(device, pictureOf(2, 2, 'bgra8unorm'));

        expect(result.width).toBe(2);
        expect(result.height).toBe(2);
        expect([...result.data]).toEqual([3, 2, 1, 4, 7, 6, 5, 8, 11, 10, 9, 12, 15, 14, 13, 16]);
        expect(staging.destroyed).toBe(1);
    });

    it('gives the buffer back when the card cannot map it', async () => {
        const { device, staging } = fakeDevice(null);

        await expect(readWebGPUTexture(device, pictureOf(2, 2, 'rgba8unorm'))).rejects.toThrow('Device lost');
        expect(staging.destroyed).toBe(1);
    });
});
