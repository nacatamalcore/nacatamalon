import { LIGHTING_2D_FLOATS, LIGHTING_2D_START } from './lighting_2d';
import type { TDrawCamera2d } from '../interface/draw/t_draw_camera_2d';

/**
 * How many 2D views the flat pipelines know: the screen, then one per camera.
 *
 * @internal
 */
const MAX_VIEWS = 16;

/**
 * Which of a pass's 2D views a drawing is seen through, from its camera: `0` the screen, or one past
 * the camera, as a sprite is drawn.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const flatSlotOf = (camera: number | undefined): number =>
    camera !== undefined && camera >= 0 && camera < MAX_VIEWS - 1 ? camera + 1 : 0;

/**
 * Writes the matrix that takes a point in the world's pixels to the screen's clip space, through a
 * 2D camera (or none, for the screen), the way the sprite shader does it: moved to the camera,
 * turned against it, magnified, then out of the game's pixels into -1 to 1, with `y` going down.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const flatViewProjection = (camera: TDrawCamera2d | null, width: number, height: number, out: Float32Array): Float32Array => {
    const cx = camera?.transform.x ?? 0;
    const cy = camera?.transform.y ?? 0;
    const rotation = camera?.transform.rotation ?? 0;
    const zoom = camera?.zoom ?? 1;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    const a = (2 * zoom) / width;
    const b = (-2 * zoom) / height;
    out[0] = a * c; out[1] = -b * s; out[2] = 0; out[3] = 0;
    out[4] = a * s; out[5] = b * c; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = -a * (c * cx + s * cy) - 1;
    out[13] = -b * (-s * cx + c * cy) + 1;
    out[14] = 0;
    out[15] = 1;
    return out;
};

/**
 * A pass's 2D views as a plugin's flat kind is handed them, one per slot: the screen, then each
 * camera. Their matrices and the lights each one's sprites are lit by, read from the frame's block
 * as `fillLighting2d` left it. Kept and written over, pass after pass.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const fillFlatCameras = (
    into: { viewProjection: Float32Array; lights: Float32Array }[],
    cameras: readonly TDrawCamera2d[],
    width: number,
    height: number,
    frame: Float32Array,
): void => {
    const count = Math.min(cameras.length, MAX_VIEWS - 1) + 1;
    into.length = count;
    for (let slot = 0; slot < count; slot++) {
        const at = LIGHTING_2D_START + slot * LIGHTING_2D_FLOATS;
        const view = into[slot] ??= { viewProjection: new Float32Array(16), lights: frame.subarray(at, at + LIGHTING_2D_FLOATS) };
        if (view.lights.buffer !== frame.buffer || view.lights.byteOffset !== at * 4) {
            view.lights = frame.subarray(at, at + LIGHTING_2D_FLOATS);
        }
        flatViewProjection(slot === 0 ? null : cameras[slot - 1], width, height, view.viewProjection);
    }
};
