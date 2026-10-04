import type { TDrawCamera2d } from '../interface/draw/t_draw_camera_2d';

/**
 * Where a world point lands on the screen through a 2D camera, in screen pixels. `null` is no
 * camera: the point is already in screen pixels and comes back unchanged.
 *
 * The same arithmetic the sprite shader runs, written once more in TypeScript. It is the one
 * definition the engine checks the shader against, and the one pointer input will run backwards to
 * turn a click into a world position:
 *
 * ```
 * screen = zoom · R(-rotation) · (world - position)
 * ```
 *
 * Move to the camera, turn against it, then magnify. The camera is undone in the reverse order an
 * object is placed in, which is what "looking through" something means.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const applyView2d = (camera: TDrawCamera2d | null, point: { x: number; y: number }): { x: number; y: number } => {
    if (camera === null) {
        return { x: point.x, y: point.y };
    }

    const dx = point.x - camera.transform.x;
    const dy = point.y - camera.transform.y;
    const c = Math.cos(-camera.transform.rotation);
    const s = Math.sin(-camera.transform.rotation);

    return {
        x: (dx * c - dy * s) * camera.zoom,
        y: (dx * s + dy * c) * camera.zoom,
    };
};

/**
 * The way back: which world point sits under a screen point, through the same camera. `null` is
 * no camera, and the point comes back unchanged.
 *
 * `applyView2d` undone step by step in the opposite order: shrink by the zoom, turn with the
 * camera, then add its position.
 *
 * ```
 * world = R(rotation) · (screen / zoom) + position
 * ```
 *
 * What pointer input uses to turn a click into a place in the world.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const unapplyView2d = (camera: TDrawCamera2d | null, point: { x: number; y: number }): { x: number; y: number } => {
    if (camera === null) {
        return { x: point.x, y: point.y };
    }

    const sx = point.x / camera.zoom;
    const sy = point.y / camera.zoom;
    const c = Math.cos(camera.transform.rotation);
    const s = Math.sin(camera.transform.rotation);

    return {
        x: sx * c - sy * s + camera.transform.x,
        y: sx * s + sy * c + camera.transform.y,
    };
};
