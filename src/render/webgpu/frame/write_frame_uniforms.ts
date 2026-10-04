import type { TDrawCamera2d } from '../../interface';
import { MAX_VIEWS } from '../sprite/write_sprite_instance';
import type { TWebGPUState } from '../types/t_webgpu_state';

/**
 * Floats before the first view: resolution (2) and the padding that aligns the view array (2).
 */
const VIEWS_START = 4;
/**
 * Floats per view: position x, y, rotation, zoom.
 */
const VIEW_FLOATS = 4;

/**
 * Only said once per page, not once per frame: the same scenes will be over the limit on the next
 * frame too, and sixty warnings a second bury everything else in the console.
 */
let warnedTooManyCameras = false;

/**
 * The size of the frame uniform buffer in bytes, matching `Uniforms` in the sprite shader.
 *
 * @internal
 */
export const FRAME_UNIFORM_FLOATS = VIEWS_START + MAX_VIEWS * VIEW_FLOATS;

/**
 * Writes what every sprite of this frame shares: the resolution, the screen view in slot 0 and each
 * camera in the slot after it.
 *
 * Only numbers are copied, a handful per camera, which is the whole point of doing this on the GPU:
 * moving a camera changes these and nothing else, however many sprites look through it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeFrameUniforms = (gpu: TWebGPUState, width: number, height: number, cameras: readonly TDrawCamera2d[]): void => {
    const data = gpu.frameUniforms.data;

    data[0] = width;
    data[1] = height;

    // Slot 0, the screen: a camera at the origin that does nothing.
    data[VIEWS_START] = 0;
    data[VIEWS_START + 1] = 0;
    data[VIEWS_START + 2] = 0;
    data[VIEWS_START + 3] = 1;

    if (cameras.length > MAX_VIEWS - 1 && !warnedTooManyCameras) {
        warnedTooManyCameras = true;
        console.warn(`[NacatamalOn] More than ${MAX_VIEWS - 1} scenes with a camera at once: the extra ones are drawn as if they had none.`);
    }

    const count = Math.min(cameras.length, MAX_VIEWS - 1);
    for (let i = 0; i < count; i++) {
        const camera = cameras[i];
        const o = VIEWS_START + (i + 1) * VIEW_FLOATS;
        data[o] = camera.transform.x;
        data[o + 1] = camera.transform.y;
        data[o + 2] = camera.transform.rotation;
        data[o + 3] = camera.zoom;
    }

    gpu.device.queue.writeBuffer(gpu.frameUniforms.buffer, 0, data);
};
