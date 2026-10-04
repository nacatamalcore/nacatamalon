import type { TDrawCamera2d } from '../../interface';
import { MAX_VIEWS } from '../sprite/write_sprite_instances';
import type { TWebGL2State } from '../types/t_webgl2_state';

/**
 * Floats before the first view: resolution (2) and the padding that aligns the view array (2).
 */
const VIEWS_START = 4;
/**
 * Floats per view: position x, y, rotation, zoom.
 */
const VIEW_FLOATS = 4;

/**
 * Said once per page, like in the WebGPU backend.
 */
let warnedTooManyCameras = false;

/**
 * The size of the frame uniform buffer in floats, matching the std140 `Uniforms` block of the sprite
 * shader. The same number as the WebGPU backend's, because the two layouts are the same bytes.
 *
 * @internal
 */
export const FRAME_UNIFORM_FLOATS = VIEWS_START + MAX_VIEWS * VIEW_FLOATS;

/**
 * Writes what every sprite of this frame shares: the resolution, the screen view in slot 0 and each
 * camera in the slot after it. The same numbers in the same places as the WebGPU backend.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeFrameUniforms = (state: TWebGL2State, width: number, height: number, cameras: readonly TDrawCamera2d[]): void => {
    const { gl } = state;
    const data = state.frameUniforms.data;

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

    gl.bindBuffer(gl.UNIFORM_BUFFER, state.frameUniforms.buffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
};
