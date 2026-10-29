import { getActiveBox } from '../../store';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * Runs your code once per frame, after every `useUpdate` of the scene has run.
 *
 * It exists for code that **reads where something ended up** rather than moving it: a camera that
 * follows the player, a marker over an enemy's head, a shadow under a sprite, a sword held in a
 * hand. In `useUpdate` the scene runs before the objects inside it, so a camera there reads the
 * player where it was before it moved this frame, and the player is drawn one step away from where
 * the camera put it. While the player runs at a steady speed the gap stays the same and nobody
 * notices; when it starts, stops, lands or hits a wall the gap changes from one frame to the next,
 * and the character shakes against the screen. Here everything has already moved, tweens and
 * physics included, so what is read is what will be drawn.
 *
 * The rule is short: move things in `useUpdate`, follow them in `useLateUpdate`.
 *
 * It receives the same `delta` and `time` as `useUpdate` in the same frame, and it follows the same
 * rules: it stops while the scene is paused, an object spawned this frame starts on the next one,
 * and an object destroyed during the updates does not run it.
 *
 * Call it in the scene body, next to the sprites. It only registers the function, it does not run
 * it.
 *
 * @param callback What to run each frame, once the updates are over. `delta` is the seconds since
 *     the previous frame, and `time` the seconds since the scene started.
 *
 * @example
 * ```ts
 * const Player = () => {
 *     const place = useTransform({ x: 40, y: 112 });
 *     useUpdate((delta) => {
 *         place.x += 100 * delta;
 *     });
 * };
 *
 * export const Level: TSceneFn = () => {
 *     const camera = useCamera2d();
 *     const player = useSpawn(Player)();
 *
 *     useLateUpdate(() => {
 *         // where the player is now, after its own update moved it this frame
 *         camera.transform.x = player.transform!.x - 128;
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Lifecycle
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLateUpdate = (callback: (delta: number, time: number) => void): void => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useLateUpdate');
    }
    box.lateCallbacks.push(callback);
};
