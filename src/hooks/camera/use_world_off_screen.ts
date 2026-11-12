import { sceneOnly } from '../../game_systems/game_systems';
import { getActiveBox } from '../../store';
import { rootOf } from '../../box';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * Has the screen draw only what this scene pins to it (`useScreenSpace`): its world is seen through
 * views of it alone (`createSpriteTexture({ sees: 'world' })`).
 *
 * For a split screen, where two views cover the whole screen and the world drawn underneath them
 * would never be seen and would cost a third time over. The scene runs as ever: everything in it
 * moves, sounds and is seen by its views, its particles included. Only what the screen draws of it
 * changes, and only while the game looks through its own cameras: a capture of the game is a picture
 * of the screen, its views and its HUD, while the editor's edit mode, a camera's preview and a capture
 * through another camera still show the world. A capture that names a camera, the scene's own
 * included, is through another one; one that names none, or `null`, is the game's. It is the scene's,
 * wherever in it it is called.
 *
 * @param on `false` undoes it, for a game that leaves a split screen. Default `true`.
 *
 * @example
 * ```ts
 * declare const Half: (player: TSprite) => void;
 * declare const Screens: (left: TTexture, right: TTexture) => void;
 *
 * export const Level: TSceneFn = () => {
 *     useWorldOffScreen();
 *     const p1 = createSprite({ key: 'red' });
 *     const p2 = createSprite({ key: 'blue' });
 *     const left = createSpriteTexture({ width: 240, height: 270, sees: 'world' }, Half, p1);
 *     const right = createSpriteTexture({ width: 240, height: 270, sees: 'world' }, Half, p2);
 *     // The two halves, pinned to the screen in a part of their own.
 *     useSpawn(Screens)(left, right);
 *     return createScene();
 * };
 * ```
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useWorldOffScreen = (on = true): void => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useWorldOffScreen');
    }
    sceneOnly('useWorldOffScreen');
    rootOf(box).worldOffScreen = on;
};
