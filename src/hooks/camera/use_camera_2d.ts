import { getActiveBox } from '../../store';
import { viewOf } from '../../box';
import { createCamera2d } from '../../camera';
import type { TCamera2d, TCamera2dOptions } from '../../camera';

/**
 * Gives the scene a camera, so its world can be bigger than the screen and scroll, turn and zoom.
 *
 * Without one, everything is drawn where its `x` and `y` say on the screen, which is what a menu or
 * a single-screen game wants. With one, those same numbers become a place in a world, and the
 * camera decides which part of that world is on screen.
 *
 * You get the camera back and move it by changing its numbers, usually every frame:
 *
 * - `transform.x`/`transform.y`: the world point on the **top-left corner** of the screen. To keep
 *   something in the middle, subtract half the screen from its position.
 * - `transform.rotation`: turns the view, in radians.
 * - `zoom`: `2` shows everything twice as big, `0.5` half as big.
 *
 * The camera belongs to the whole scene, so it does not matter which part of the scene asks for it.
 * Asking twice replaces the first one. Inside a picture made by `createSpriteTexture` it belongs to
 * that picture instead, and the scene keeps its own.
 *
 * Something that must stay still on screen while the world moves, a score or a health bar, has two
 * ways to do it: put it in its own scene started with `useScene().launch()`, or mark it with
 * `useScreenSpace()`.
 *
 * @param options Where the camera starts: `x`, `y`, `rotation` and `zoom`, all optional.
 * @returns The camera. Change its fields and the view follows on the next frame.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const camera = useCamera2d();
 *     const hero = createSprite({ key: 'hero', transform: { x: 900, y: 600 } });
 *
 *     useUpdate(() => {
 *         // The screen is 480x320: half of it keeps the hero in the middle
 *         camera.transform.x = hero.transform.x - 240;
 *         camera.transform.y = hero.transform.y - 160;
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
export const useCamera2d = (options?: TCamera2dOptions): TCamera2d => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useCamera2d: call it inside a scene body, not from a timer or a callback.');
    }

    const scene = viewOf(box);
    if (scene.camera2d !== null) {
        console.warn(`[NacatamalOn] useCamera2d: '${scene.name}' already had a camera. The new one replaces it.`);
    }

    const camera = createCamera2d(options);
    scene.camera2d = camera;
    return camera;
};
