import { fillCameraSpace, newCameraSpace } from '../render/shared/compute_mvp_3d';
import type { TCamera3d } from './types/t_camera_3d';

/**
 * Where a point of the world lands on the screen.
 *
 * `x` and `y` are in the game's pixels, from the top-left corner, the same ones a sprite is placed
 * in. `depth` goes from 0 at the camera's near plane to 1 at its far one. `behind` says the point is
 * behind the camera, where `x` and `y` mean nothing and whatever was going to be drawn there should
 * not be.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TScreenPoint = { x: number; y: number; depth: number; behind: boolean };

/**
 * Scratch, filled and read inside one call.
 */
const space = newCameraSpace();

/**
 * Where a point of the world is drawn on the screen: the other way round from `screenToRay`.
 *
 * What puts a name over a character's head, a marker on something off in the distance, or a health
 * bar that follows a model: a sprite placed at the answer sits exactly over the point, because the
 * answer comes from the same view and projection the scene is drawn with.
 *
 * @param camera The scene's camera, or `null`.
 * @param width The game's width, in pixels.
 * @param height The game's height, in pixels.
 * @param point The point in the world.
 * @returns Where it is on the screen, and whether it is behind the camera.
 *
 * @example
 * ```ts
 * const camera = useCamera3d({ projection: 'perspective', fov: 60, y: 3, z: 6 });
 * const game = useGame();
 * declare const enemy: TMesh;
 * declare const label: TText;
 *
 * useUpdate(() => {
 *     const at = worldToScreen(camera, game.getWidth(), game.getHeight(), enemy.transform);
 *     label.visible = !at.behind;
 *     label.transform.x = at.x;
 *     label.transform.y = at.y - 20;
 * });
 * ```
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const worldToScreen = (
    camera: TCamera3d | null,
    width: number,
    height: number,
    point: { x: number; y: number; z: number },
): TScreenPoint => {
    fillCameraSpace(space, camera, width, height);
    const m = space.viewProjection;
    const { x, y, z } = point;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cz = m[2] * x + m[6] * y + m[10] * z + m[14];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];

    // An orthographic view has w = 1 everywhere and nothing is ever behind it.
    const behind = cw <= 0;
    const w = behind ? 1 : cw;
    return {
        x: ((cx / w) + 1) / 2 * width,
        y: (1 - (cy / w)) / 2 * height,
        depth: cz / w,
        behind,
    };
};
