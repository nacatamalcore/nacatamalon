import { sceneOnly } from '../../game_systems/game_systems';
import { getActiveBox } from '../../store';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { countUnlit2d } from '../../light/count_lights_2d';

/**
 * Leaves what is created here out of the scene's 2D lights: it keeps its own colours however dark
 * the world is, and still moves with the camera, unlike the HUD. For what gives off its own light:
 * a fire, a neon sign, the glass of a lamp, the eyes of something in the dark, the sparks of a
 * torch (particles are lit like the rest, so dust in a cave stays dark).
 *
 * It covers everything this part of the scene creates and everything created under it, however
 * deep. In a scene with no 2D lights it changes nothing. Each lit scene that has something left out
 * draws it through one view more, of the fifteen a frame has for scenes; with none left, it is drawn
 * lit, with the rest of the scene. Set it with this hook, not by writing the box's `unlit2d`: the hook
 * is what tells the scene to keep a view for it.
 *
 * @param on `false` undoes it. Default `true`.
 *
 * @example
 * ```ts
 * const Torch = () => {
 *     useLight2d({ radius: 90, color: '#ff9c3a' });
 *     useSpawn(() => {
 *         useUnlit2d();
 *         createSprite({ width: 6, height: 6, tint: '#ffcf6b' });
 *     })();
 * };
 * ```
 *
 * @category Lighting
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useUnlit2d = (on = true): void => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useUnlit2d');
    }
    sceneOnly('useUnlit2d');
    if (on && !box.unlit2d) countUnlit2d(box);
    box.unlit2d = on;
};
