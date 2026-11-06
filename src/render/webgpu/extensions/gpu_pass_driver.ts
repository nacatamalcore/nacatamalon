import { createGpuPassHost } from '../../extensions/gpu_pass_host';
import type { TWebGPUTexture } from '../texture';
import type { TTexture } from '../../../loaders';
import type { TWebGpuPassContext, TGpuPassFrame } from '../../../extend/gpu/types';

/**
 * The passes of a WebGPU game. Their pictures can be read, written from compute, drawn into and
 * copied, and each pass is handed the frame's own encoder: what it records is sent with the rest of
 * the frame, in one submit.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWebGPUPassHost = (device: GPUDevice) => createGpuPassHost({
    backend: 'WEBGPU',
    // Nothing to keep safe: a WebGPU pass cannot change a pipeline or a binding of the engine's.
    guard: (callback) => callback(),
    setup: (options, records) => {
        const limit = device.limits.maxTextureDimension2D;
        const outputs: GPUTexture[] = [];
        for (const record of records) {
            if (record.width > limit || record.height > limit) {
                throw new Error(`[NacatamalOn] useGpuPass '${options.name}': an output of ${record.width}x${record.height} is bigger than this card allows (${limit}). Make it smaller.`);
            }
            const gpuTexture = device.createTexture({
                label: `${options.name} output`,
                size: [record.width, record.height],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
                    | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
            });
            record.gpu = { resourceType: 'texture', gpuTexture } as TWebGPUTexture;
            outputs.push(gpuTexture);
        }
        const context: TWebGpuPassContext = {
            backend: 'WEBGPU',
            device,
            outputs,
            texture: (record: TTexture) => record.status === 'ready' && record.gpu !== null
                ? (record.gpu as TWebGPUTexture).gpuTexture ?? null : null,
        };
        const instance = options.webgpu!(context);
        if (!instance || typeof instance.render !== 'function') {
            throw new Error(`[NacatamalOn] useGpuPass '${options.name}': its webgpu factory returned no render. Return { render, destroy? } from it.`);
        }
        // One frame object for the pass's whole life, written over each frame.
        const frame = { time: 0, delta: 0, width: 0, height: 0, encoder: null as unknown as GPUCommandEncoder };
        return {
            render: (clock: TGpuPassFrame, encoder?: unknown) => {
                frame.time = clock.time;
                frame.delta = clock.delta;
                frame.width = clock.width;
                frame.height = clock.height;
                frame.encoder = encoder as GPUCommandEncoder;
                instance.render(frame);
            },
            destroy: () => instance.destroy?.(),
        };
    },
    release: (records) => {
        for (const record of records) {
            if (record.gpu !== null) (record.gpu as TWebGPUTexture).gpuTexture.destroy();
        }
    },
});
