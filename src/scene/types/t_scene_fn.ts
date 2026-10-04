import type { TScene } from './t_scene';

/**
 * A scene: a function that runs once, when the scene starts, and returns `createScene()`. What it
 * makes and asks for in between (sprites, `useUpdate`, `useKeyboard`...) is what the scene has.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneFn = () => TScene;
