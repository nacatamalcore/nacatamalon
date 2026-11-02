import { freeTexturesKeptBy } from '../loaders/texture/free_texture';
import type { TRuntimeStore } from '../store';
import type { TTransitionState } from './types/t_transition_state';

/**
 * Takes a transition away, if it is still the one in flight, and lets go of what it was keeping.
 *
 * The one door every end goes through: the uncover finishing, a scene that failed to build taking
 * its cover with it, and a scene at either end being stopped from elsewhere. A mask let go of while
 * the transition drew it is only taken off the card here.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const endTransition = (store: TRuntimeStore, state: TTransitionState): void => {
    if (store.get('transition').active === state) {
        store.setState('transition', { active: null });
    }
    freeTexturesKeptBy(state);
};
