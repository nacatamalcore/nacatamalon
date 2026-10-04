import { describe, expect, it } from 'bun:test';
import { paddedUpload } from '../src/render/webgpu/resources/create_buffer';

/**
 * What actually gets sent to a WebGPU device.
 *
 * WebGPU refuses an upload whose length is not a whole four bytes, and an odd number of 16 bit
 * triangle points is exactly that. It is not a corner: a model has three points per triangle, so
 * any model with an odd number of triangles is one, and roughly half of them are. Found on a real
 * asset pack, where two towers of three failed to appear on WebGPU and were fine on WebGL2.
 */

describe('what is sent to the device', () => {
    it('leaves a run that is already a round four bytes exactly as it was', () => {
        const even = new Uint16Array([0, 1, 2, 3]);

        expect(paddedUpload(even)).toBe(even);
    });

    it('rounds an odd number of narrow triangle points up, keeping every one of them', () => {
        const odd = new Uint16Array([0, 1, 2]);
        const sent = paddedUpload(odd);

        expect(sent.byteLength).toBe(8);
        expect(Array.from(new Uint16Array(sent.buffer, sent.byteOffset, 3))).toEqual([0, 1, 2]);
    });

    it('never touches a run of decimals, which are already four bytes each', () => {
        const floats = new Float32Array([1, 2, 3]);

        expect(paddedUpload(floats)).toBe(floats);
    });

    it('rounds a real model, not just a made-up one', () => {
        // One of the towers that failed: 6.069 triangle points, 12.138 bytes.
        const real = new Uint16Array(6069);

        expect(real.byteLength % 4).not.toBe(0);
        expect(paddedUpload(real).byteLength % 4).toBe(0);
    });
});
