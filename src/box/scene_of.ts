import { rootOf } from './root_of';
import type { TBox } from './types/t_box';
import type { TGameObject } from '../hooks/spawn/use_spawn';

/**
 * The scene something is in: the top of its tree, the scene itself for a scene.
 *
 * What a behaviour starts from to reach the rest of its scene by name: `findObject(sceneOf(self),
 * 'Score')` finds the score wherever it sits, not only among the behaviour's own children. A box in
 * a screen inside the game (`createSpriteTexture`) is still in the scene that screen is in.
 *
 * @param object Anything in a scene: a box, a component, a scene.
 * @returns Its scene's root.
 *
 * @example
 * ```ts
 * registerScript('door', (self) => {
 *     useReady(() => {
 *         const exit = findObject(sceneOf(self), 'Exit');
 *         if (exit !== null) exit.visible = false;
 *     });
 * });
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const sceneOf = (object: TBox): TGameObject => rootOf(object) as TGameObject;
