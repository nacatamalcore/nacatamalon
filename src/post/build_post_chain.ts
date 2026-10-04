import type { TPostEffect } from './types/t_post_effect';
import type { TRuntimeStore } from '../store';

/**
 * The effects that will actually run this frame, or `null` when none will.
 *
 * **`null` and never an empty list**, and that distinction is the whole zero-cost promise. The
 * backend only enters its post path when this is a list, so a game with no effects, one whose
 * effects are all switched off, and one whose shader files have not landed yet all draw the way they
 * did before any of this was written: straight at the canvas, with nothing copied.
 *
 * An empty list would be a branch that can be entered by accident, and the accident would be an
 * extra full-screen copy in every existing game.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const buildPostChain = (store: TRuntimeStore): TPostEffect[] | null => {
    // A scene change goes **first**, ahead of everything the game asked for, and it ignores the
    // switch below. Two reasons, and they are the same reason said twice: a fade is something
    // happening in the game, and everything after it is the console showing the result. So a game
    // that reduces its colours quantizes its own fades, which is how they looked on that hardware;
    // and a host that turned the chain off to see the raw scene still sees the change covered
    // rather than a scene that is invisible for a third of a second and then appears at once.
    const transition = store.get('transition').active;

    const { effects, enabled } = store.get('post');
    if (!enabled || effects.length === 0) {
        return transition === null ? null : [transition.effect];
    }

    const running: TPostEffect[] = transition === null ? [] : [transition.effect];
    for (const effect of effects) {
        // No hook means its file has not landed, or landed broken. Either way there is nothing to
        // compile, and skipping it is what lets a scene look right before its effects arrive.
        if (effect.enabled && effect.fragment !== null) {
            running.push(effect);
        }
    }

    return running.length === 0 ? null : running;
};
