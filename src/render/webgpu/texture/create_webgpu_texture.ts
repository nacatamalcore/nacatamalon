import { mipLevelsOf } from '../../shared/mip_levels';
import { generateWebGPUMipmaps } from './generate_mipmaps';
import type { ITexture } from '../../interface';

/**
 * What an `ITexture` is inside the WebGPU backend. Never leaves `render/webgpu`.
 *
 * @internal
 */
export type TWebGPUTexture = ITexture & {
    readonly gpuTexture: GPUTexture;
};

/**
 * Uploads a decoded image as an `rgba8unorm` texture, with its chain of mipmaps when asked.
 *
 * `RENDER_ATTACHMENT` is not there to draw into it: `copyExternalImageToTexture` requires it, and so
 * does drawing the mipmaps.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWebGPUTexture = (device: GPUDevice, image: ImageBitmap, mipmaps = false): TWebGPUTexture => {
    const gpuTexture = device.createTexture({
        label: 'texture',
        size: [image.width, image.height],
        format: 'rgba8unorm',
        mipLevelCount: mipmaps ? mipLevelsOf(image.width, image.height) : 1,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: image }, { texture: gpuTexture }, [image.width, image.height]);
    generateWebGPUMipmaps(device, gpuTexture);
    // The image is the renderer's now (see `IRenderer.createTexture`), and the copy is all WebGPU needs.
    image.close();
    return { resourceType: 'texture', gpuTexture };
};

/**
 * The `GPUTexture` behind a handle. Only valid for handles this backend created, which is every
 * handle a WebGPU game can hold.
 *
 * @internal
 */
export const toGpuTexture = (texture: ITexture): GPUTexture => (texture as TWebGPUTexture).gpuTexture;
