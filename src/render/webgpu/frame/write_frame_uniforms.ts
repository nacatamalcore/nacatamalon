import { fillLighting2d, FRAME_FLOATS_2D } from '../../shared/lighting_2d';
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
 * The renderers that already said so. Once per renderer, which is once per game, not once per frame:
 * the same scenes will be over the limit on the next frame too, and sixty warnings a second bury
 * everything else in the console.
 */
const warnedTooManyCameras = new WeakSet<TWebGPUState>();

/**
 * The size of the frame uniform buffer in floats, matching `Uniforms` in the sprite shader: the views,
 * then each view's 2D lights.
 *
 * @internal
 */
export const FRAME_UNIFORM_FLOATS = FRAME_FLOATS_2D;

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

    // The views' 2D lights, and how far into the block this frame's views reach: what lies past
    // them is read by no sprite, so it is not sent.
    const used = fillLighting2d(data, cameras);
    data[0] = width;
    data[1] = height;

    // Slot 0, the screen: a camera at the origin that does nothing.
    data[VIEWS_START] = 0;
    data[VIEWS_START + 1] = 0;
    data[VIEWS_START + 2] = 0;
    data[VIEWS_START + 3] = 1;

    if (cameras.length > MAX_VIEWS - 1 && !warnedTooManyCameras.has(gpu)) {
        warnedTooManyCameras.add(gpu);
        console.warn(`[NacatamalOn] 2D views: more than ${MAX_VIEWS - 1} at once (a scene takes one with a camera or 2D lights, and one more for what it leaves out of them), so the extra ones are drawn as if they had no camera. Run fewer scenes at once.`);
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

    gpu.device.queue.writeBuffer(gpu.frameUniforms.buffer, 0, data, 0, used);
};
