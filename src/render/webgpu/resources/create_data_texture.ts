import { mipLevelsOf } from '../../shared/mip_levels';
import { generateWebGPUMipmaps } from '../texture';
import type { ITexture } from '../../interface';
import type { TWebGPUTexture } from '../texture';

/**
 * Uploads raw bytes as a picture: what is worked out rather than decoded, like a palette.
 *
 * The size is checked here and not left to the graphics card, because bytes that do not match the
 * size are read past the end and come back as colours that look plausible and are wrong.
 *
 * With `mipmaps`, the chain of smaller copies is drawn from the bytes, so the texture is also made
 * to be drawn into (`RENDER_ATTACHMENT`), which only the drawing of the copies does.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWebGPUDataTexture = (device: GPUDevice, data: Uint8Array, width: number, height: number, mipmaps = false): ITexture => {
    const expected = width * height * 4;
    if (data.length !== expected) {
        throw new Error(`[NacatamalOn] createDataTexture: ${width} by ${height} needs ${expected} bytes and ${data.length} were given.`);
    }

    const gpuTexture = device.createTexture({
        label: 'data texture',
        size: [width, height],
        format: 'rgba8unorm',
        mipLevelCount: mipmaps ? mipLevelsOf(width, height) : 1,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | (mipmaps ? GPUTextureUsage.RENDER_ATTACHMENT : 0),
    });
    device.queue.writeTexture({ texture: gpuTexture }, data, { bytesPerRow: width * 4, rowsPerImage: height }, [width, height]);
    generateWebGPUMipmaps(device, gpuTexture);
    const texture: TWebGPUTexture = { resourceType: 'texture', gpuTexture };
    return texture;
};
