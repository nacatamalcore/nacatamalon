import type { ITexture } from '../../interface';
import type { TWebGPUTexture } from '../texture';

/**
 * Uploads raw bytes as a picture: what is worked out rather than decoded, like a palette.
 *
 * The size is checked here and not left to the graphics card, because bytes that do not match the
 * size are read past the end and come back as colours that look plausible and are wrong.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWebGPUDataTexture = (device: GPUDevice, data: Uint8Array, width: number, height: number): ITexture => {
    const expected = width * height * 4;
    if (data.length !== expected) {
        throw new Error(`[NacatamalOn] createDataTexture: ${width} by ${height} needs ${expected} bytes and ${data.length} were given.`);
    }

    const gpuTexture = device.createTexture({
        label: 'data texture',
        size: [width, height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: gpuTexture }, data, { bytesPerRow: width * 4, rowsPerImage: height }, [width, height]);
    const texture: TWebGPUTexture = { resourceType: 'texture', gpuTexture };
    return texture;
};
