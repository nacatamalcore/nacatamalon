import type { TCamera3d } from './types/t_camera_3d';

/**
 * Turns a camera to look at a point, from wherever it is standing.
 *
 * It writes the camera's `rotationY` (left and right) and `rotationX` (up and down), and leaves its
 * roll alone. Call it in `useUpdate` to keep a moving thing in the middle of the view. A camera
 * turned by a quaternion is switched back to angles, since a quaternion would be read instead of
 * them and the camera would not move.
 *
 * Straight up or straight down has no left or right to speak of, so there the camera keeps the
 * `rotationY` it had.
 *
 * @param camera The camera to turn.
 * @param target Where to look: anything with `x`, `y` and `z`, such as another object's placement.
 * @returns The same camera.
 *
 * @example
 * ```ts
 * declare const player: TTransform3d;
 *
 * const camera = useCamera3d({ projection: 'perspective', fov: 60, y: 3, z: 6 });
 * useUpdate(() => cameraLookAt(camera, player));
 * ```
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const cameraLookAt = (camera: TCamera3d, target: { x: number; y: number; z: number }): TCamera3d => {
    const t = camera.transform;
    const dx = target.x - t.x;
    const dy = target.y - t.y;
    const dz = target.z - t.z;
    const across = Math.hypot(dx, dz);

    // A camera looks along its own -Z, turned first around Y and then around X, which is what
    // `rotationMatrix` builds. Undoing that for the direction wanted gives these two angles.
    if (across > 1e-9) {
        t.rotationY = Math.atan2(-dx, -dz);
    }
    if (across > 1e-9 || Math.abs(dy) > 1e-9) {
        t.rotationX = Math.atan2(dy, across);
    }
    if (t.quaternion !== undefined && t.quaternion !== null) {
        t.quaternion = null;
    }
    return camera;
};
