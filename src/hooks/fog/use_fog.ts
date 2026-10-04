import { viewOf } from '../../box';
import { createFog } from '../../fog/create_fog';
import { getActiveBox } from '../../store';
import type { TFog, TFogOptions } from '../../fog/types/t_fog';

/**
 * Puts the scene in fog: its models fade into `color` between `near` and `far` from the camera.
 *
 * The fog belongs to the scene, like its camera, so one is enough and a second is ignored with a
 * warning. It covers every model the scene draws, a material of your own included, and leaves the
 * 2D alone. Set the game's background to the same colour and the far end of the world melts into
 * it instead of stopping at a wall, which is the whole trick.
 *
 * @param options What it fades into and over what distance.
 * @returns The fog, to read and to change: every field is read every frame.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     useCamera3d({ projection: 'perspective', z: 8 });
 *     const fog = useFog({ color: getColor('#1a1426'), near: 6, far: 40 });
 *
 *     useUpdate((delta, time) => {
 *         // Breathing: the fog comes in and goes out
 *         fog.far = 40 + Math.sin(time) * 10;
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
export const useFog = (options: TFogOptions = {}): TFog => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useFog: call it inside a scene body.');
    }

    // The view's and not the scene's, for the reason the camera is: a screen with a world of its
    // own has its own fog, and asking for one inside it must not fog the room the screen is in.
    const scene = viewOf(box);
    if (scene.fog !== null) {
        console.warn('[NacatamalOn] useFog: this scene already has fog, so the second is ignored. Change the one it has instead.');
        return scene.fog;
    }

    scene.fog = createFog(options);
    return scene.fog;
};
