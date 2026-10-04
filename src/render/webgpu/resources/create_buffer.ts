import type { IBuffer, TBufferUsage } from '../../interface';

/**
 * What an `IBuffer` is inside the WebGPU backend. Never leaves `render/webgpu`.
 *
 * @internal
 */
export type TWebGPUBuffer = IBuffer & {
    gpuBuffer: GPUBuffer;
    /**
     * How many bytes it was made for, which is not how many are being drawn right now.
     */
    capacity: number;
};

const usageFlags = (usage: TBufferUsage): number => {
    if (usage === 'index') {
        return GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST;
    }
    if (usage === 'uniform') {
        return GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    }
    if (usage === 'storage') {
        return GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    }
    return GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
};

/**
 * Rounds an upload up to a whole four bytes, copying only when it has to.
 *
 * **What is written has to be a round four bytes, not just the room it is written into.** An odd
 * number of 16 bit triangle points is the one case that is not already, and it is not a rare one:
 * a model has three points per triangle, so any model with an odd number of triangles lands here.
 * Roughly half of them do. Without this the upload is refused and the model never appears, on
 * WebGPU only, which makes it look like a broken file rather than a broken backend.
 *
 * @internal
 */
const padded = (data: Float32Array | Uint16Array | Uint32Array): ArrayBufferView => {
    if (data.byteLength % 4 === 0) {
        return data;
    }
    const out = new Uint8Array(Math.ceil(data.byteLength / 4) * 4);
    out.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return out;
};

/**
 * Uploads numbers and hands back a handle to them.
 *
 * The size is rounded up to four bytes because that is what the graphics card asks for, and an odd
 * number of 16 bit indices is the one case where it matters.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWebGPUBuffer = (device: GPUDevice, data: Float32Array | Uint16Array | Uint32Array, usage: TBufferUsage): TWebGPUBuffer => {
    const capacity = Math.ceil(data.byteLength / 4) * 4;
    const gpuBuffer = device.createBuffer({
        label: `${usage} buffer`,
        size: Math.max(capacity, 4),
        usage: usageFlags(usage),
    });
    device.queue.writeBuffer(gpuBuffer, 0, padded(data));
    return { resourceType: 'buffer', gpuBuffer, capacity };
};

/**
 * The same rounding, for anything that needs to know what will actually be sent.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const paddedUpload = padded;

/**
 * Writes over what a buffer holds. What is written has to fit: whoever owns it keeps count.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const updateWebGPUBuffer = (device: GPUDevice, buffer: IBuffer, data: Float32Array | Uint16Array): void => {
    const target = buffer as TWebGPUBuffer;
    if (data.byteLength > target.capacity) {
        throw new Error(`[NacatamalOn] updateBuffer: ${data.byteLength} bytes do not fit in a buffer of ${target.capacity}. Make a bigger one.`);
    }
    device.queue.writeBuffer(target.gpuBuffer, 0, data);
};

/**
 * The `GPUBuffer` behind a handle. Only valid for handles this backend made.
 *
 * @internal
 */
export const toGpuBuffer = (buffer: IBuffer): GPUBuffer => (buffer as TWebGPUBuffer).gpuBuffer;
