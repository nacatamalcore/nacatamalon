import { toGpuTexture } from '../texture';
import type { ITexture, TTextureRegion } from '../../interface';

/**
 * Sends a rectangle of a picture's bytes to the texture made from it.
 *
 * The bytes are the whole picture and the copy starts at the rectangle's first byte, a full picture
 * row apart, so nothing is copied out on this side first.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const updateWebGPUDataTexture = (
    device: GPUDevice,
    texture: ITexture,
    data: Uint8Array,
    width: number,
    height: number,
    region: TTextureRegion = { x: 0, y: 0, width, height },
): void => {
    if (region.width <= 0 || region.height <= 0) {
        return;
    }
    device.queue.writeTexture(
        { texture: toGpuTexture(texture), origin: [region.x, region.y] },
        data,
        { offset: (region.y * width + region.x) * 4, bytesPerRow: width * 4, rowsPerImage: height },
        [region.width, region.height],
    );
};
