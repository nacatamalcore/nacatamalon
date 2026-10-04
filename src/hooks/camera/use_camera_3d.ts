import { viewOf } from '../../box';
import { createCamera3d } from '../../camera/create_camera_3d';
import { getActiveBox } from '../../store';
import type { TCamera3d, TCamera3dOptions } from '../../camera/types/t_camera_3d';

/**
 * Gives the scene a camera to look at its models through, and returns it.
 *
 * Without one, models are drawn straight in the game's pixels, flat on, exactly the way sprites are
 * drawn without a 2D camera. With one, the scene is seen from wherever the camera is.
 *
 * There are two ways of seeing and the choice is what the game looks like. `'orthographic'`, the
 * default, has no vanishing point and **measures in the same pixels a sprite does**: a model one
 * unit wide is one pixel wide, so a 3D piece can stand on a 2D board and pan and zoom with it.
 * `'perspective'` is the usual one, where things shrink with distance.
 *
 * What comes back is the camera itself, so moving it is changing a number and it takes effect on
 * the next frame drawn. A scene has one, as it has one 2D camera; asking again gives back the one
 * it already has, and says so, rather than quietly replacing it. Inside a picture made by
 * `createSpriteTexture` it belongs to that picture instead, and the scene keeps its own.
 *
 * @param options Where it starts, how it sees, and how far it can see.
 * @returns The camera, to read and to change.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     const camera = useCamera3d({ projection: 'perspective', z: 6 });
 *
 *     useUpdate((delta) => {
 *         camera.transform.rotationY += delta * 0.5;
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCamera3d = (options: TCamera3dOptions = {}): TCamera3d => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useCamera3d: call it inside a scene body.');
    }

    const scene = viewOf(box);
    if (scene.camera3d !== null) {
        console.warn('[NacatamalOn] useCamera3d: this scene already looks through one, so the second is ignored. Move the one it has instead.');
        return scene.camera3d;
    }

    scene.camera3d = createCamera3d(options);
    return scene.camera3d;
};
