import { toGpuTexture } from '../texture';
import type { ITexture, TCaptureResult } from '../../interface';

/**
 * Brings a picture's pixels back from the graphics card.
 *
 * The rows have to be copied in lots of 256 bytes, which is what the graphics card insists on, so a
 * picture whose width is not a multiple of 64 pixels comes back with padding at the end of every row
 * and is trimmed here. Getting that wrong shows as a picture that slants a little more on each row,
 * which is a memorable way to spend an afternoon.
 *
 * A picture made to be drawn into is in the canvas's format, and on most machines that is one with
 * blue and red the other way round. The interface promises red first, so they are swapped back here:
 * the alternative is a capture whose colours depend on the machine it ran on.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readWebGPUTexture = async (device: GPUDevice, texture: ITexture): Promise<TCaptureResult> => {
    const gpuTexture = toGpuTexture(texture);
    const { width, height } = gpuTexture;

    const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
    const staging = device.createBuffer({
        label: 'texture readback',
        size: bytesPerRow * height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: gpuTexture }, { buffer: staging, bytesPerRow, rowsPerImage: height }, [width, height]);
    device.queue.submit([encoder.finish()]);

    await staging.mapAsync(GPUMapMode.READ);
    const padded = new Uint8Array(staging.getMappedRange());

    const data = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row++) {
        data.set(padded.subarray(row * bytesPerRow, row * bytesPerRow + width * 4), row * width * 4);
    }
    if (gpuTexture.format.startsWith('bgra')) {
        for (let at = 0; at < data.length; at += 4) {
            const blue = data[at];
            data[at] = data[at + 2];
            data[at + 2] = blue;
        }
    }
    staging.unmap();
    staging.destroy();

    return { width, height, data };
};
