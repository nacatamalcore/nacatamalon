import { fillCameraSpace, newCameraSpace } from '../render/shared/compute_mvp_3d';
import * as mat from '../math/mat4';
import type { TCamera3d } from './types/t_camera_3d';

/**
 * A ray in the world: where it starts, and the direction it goes in, one unit long.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRay = {
    origin: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
};

/**
 * Scratch, filled and read inside one call.
 */
const space = newCameraSpace();
const inverse = mat.create();

/**
 * One point of the screen's depth range, taken back into the world.
 */
const unproject = (m: mat.Mat4, x: number, y: number, z: number): [number, number, number] => {
    const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [wx / w, wy / w, wz / w];
};

/**
 * The ray that goes into the world through a point of the screen: what is under the pointer.
 *
 * It is worked out from the very view and projection the scene is drawn with, so the ray passes
 * through exactly what is drawn at that pixel. Test it against what can be picked (a sphere around
 * each object, a box, a plane) and the nearest hit is what was clicked; against the floor's plane, it
 * gives the point of the floor under the pointer, which is what dragging something across it needs.
 *
 * `x` and `y` are in the game's pixels, the pointer's `screenX` and `screenY`, and `width` and
 * `height` are the game's size (`useGame().getWidth()`, `getHeight()`). With no camera it uses the
 * view the scene falls back to when it has none.
 *
 * @param camera The scene's camera, or `null`.
 * @param width The game's width, in pixels.
 * @param height The game's height, in pixels.
 * @param x The point, from the left.
 * @param y The point, from the top.
 * @returns The ray, starting on the camera's near plane.
 *
 * @example
 * ```ts
 * const camera = useCamera3d({ projection: 'perspective', fov: 60, y: 3, z: 6 });
 * const game = useGame();
 * declare const marker: TTransform3d;
 *
 * const pointer = usePointer();
 * pointer.onDown((info) => {
 *     const ray = screenToRay(camera, game.getWidth(), game.getHeight(), info.screenX, info.screenY);
 *     // How far along the ray the floor (y = 0) is, and the point there.
 *     const t = -ray.origin.y / ray.direction.y;
 *     marker.x = ray.origin.x + ray.direction.x * t;
 *     marker.z = ray.origin.z + ray.direction.z * t;
 * });
 * ```
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const screenToRay = (camera: TCamera3d | null, width: number, height: number, x: number, y: number): TRay => {
    fillCameraSpace(space, camera, width, height);
    mat.invert(space.viewProjection, inverse);

    // The screen's middle is 0 and its edges are -1 and 1, with y growing upwards. The depth runs
    // from 0 at the near plane to 1 at the far one, as the renderer's projection lays it out.
    const nx = (x / width) * 2 - 1;
    const ny = 1 - (y / height) * 2;
    const near = unproject(inverse, nx, ny, 0);
    const far = unproject(inverse, nx, ny, 1);

    const dx = far[0] - near[0];
    const dy = far[1] - near[1];
    const dz = far[2] - near[2];
    const length = Math.hypot(dx, dy, dz) || 1;
    return {
        origin: { x: near[0], y: near[1], z: near[2] },
        direction: { x: dx / length, y: dy / length, z: dz / length },
    };
};
