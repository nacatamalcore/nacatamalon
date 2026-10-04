import type { ITexture } from '../../interface';
import type { TWebGPUTexture } from '../texture';

/**
 * An empty picture a pass can draw into and anything else can then show.
 *
 * `COPY_SRC` is there so its pixels can be brought back afterwards; `RENDER_ATTACHMENT` is what lets
 * a pass point at it, and `TEXTURE_BINDING` is what lets a sprite show it.
 *
 * It is made in **the canvas's own format**, which is not a detail: a pipeline is built for one
 * format, and pointing a pass at a picture of another one is refused outright. Using the canvas's
 * means the same pipelines draw on the screen and into a picture, with nothing built twice.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createWebGPURenderTexture = (device: GPUDevice, format: GPUTextureFormat, width: number, height: number): ITexture => {
    const gpuTexture = device.createTexture({
        label: 'render texture',
        size: [Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height))],
        format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
    });
    const texture: TWebGPUTexture = { resourceType: 'texture', gpuTexture };
    return texture;
};
