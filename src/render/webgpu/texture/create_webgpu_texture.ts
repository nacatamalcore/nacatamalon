import { mipLevelsOf } from '../../shared/mip_levels';
import { generateWebGPUMipmaps } from './generate_mipmaps';
import type { ITexture } from '../../interface';

/**
 * What an `ITexture` is inside the WebGPU backend. Never leaves `render/webgpu`.
 *
 * @internal
 */
export type TWebGPUTexture = ITexture & {
    /**
     * Another one, with the same picture, after the card was lost and came back.
     */
    gpuTexture: GPUTexture;
};

/**
 * Uploads a decoded image as an `rgba8unorm` texture, with its chain of mipmaps when asked. The image
 * is left open: it is what the texture is made again from if the card is lost (`keepResources`).
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
    return { resourceType: 'texture', gpuTexture };
};

/**
 * The `GPUTexture` behind a handle. Only valid for handles this backend created, which is every
 * handle a WebGPU game can hold.
 *
 * @internal
 */
export const toGpuTexture = (texture: ITexture): GPUTexture => (texture as TWebGPUTexture).gpuTexture;
