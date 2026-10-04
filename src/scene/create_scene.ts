import type { TBox } from '../box';
import type { TScene } from './types/t_scene';

/**
 * Ends a scene's body, and is what it returns: `return createScene()`.
 *
 * Everything the body made (sprites, models, objects from `useSpawn`) is already in the scene, so
 * it is usually called with nothing. `children` is for objects built somewhere else and handed in.
 * It touches nothing itself: it only describes.
 *
 * It takes no name. A scene is named by its key in what `createGame` is given, so the game knows
 * every scene by name as soon as it starts, before any of them has run.
 *
 * @example
 * ```ts
 * const Menu: TSceneFn = () => createScene();
 *
 * const Level: TSceneFn = () => {
 *     const hero = createSprite({ width: 16, height: 16 });
 *     useUpdate((delta) => {
 *         hero.transform.x += 30 * delta;
 *     });
 *     return createScene();
 * };
 *
 * createGame('#app', { width: 320, height: 240 })({ Menu, Level });
 * ```
 *
 * @param children - Objects made outside this body that should hang from the scene too.
 * @returns What a scene function returns.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createScene = (children: readonly TBox[] = []): TScene =>
    Object.freeze({ children });
