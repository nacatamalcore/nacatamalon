import type { TBox } from '../box';
import type { TDrawable } from '../gameobjects/types';

/**
 * Whether `target` is a spawned object rather than something one of them draws.
 *
 * Told apart by `children`, which only a box has, and not by `type`, which only a drawable has:
 * every drawable carries a `type` that says which kind it is, so asking about `type` would
 * answer "yes" for a kind nobody has written yet as much as for a sprite.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isGameObject = (target: TDrawable | TBox): target is TBox => 'children' in target;
