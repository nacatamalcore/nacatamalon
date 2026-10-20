import type { TScene } from './t_scene';

/**
 * A scene: a function that runs once, when the scene starts, and returns `createScene()`. What it
 * makes and asks for in between (sprites, `useUpdate`, `useKeyboard`...) is what the scene has.
 *
 * It may take props, like a component: how this scene is opened (which level, which door), given by
 * `useScene().change(Level, { props: { level: 3 } })`. Every prop needs a default, because a scene
 * also starts with none: the first one, a restart, the editor's Play.
 *
 * @example
 * ```ts
 * const Level = ({ level = 1 }: { level?: number }) => {
 *     createText({ text: `LEVEL ${level}` });
 *     return createScene();
 * };
 * ```
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSceneFn<P extends object = object> = (props: P) => TScene;
