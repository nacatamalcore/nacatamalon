import { flushSceneWaits } from './flush_scene_waits';
import type { TRuntimeStore } from '../store';

/**
 * Runs what `useSceneTransitionEnd` set aside whose scene is now on screen with nothing over it.
 *
 * A scene is waiting while it is held (behind a transition, or behind the splash before its fade
 * starts) and while it is the one a transition is bringing in, which goes on after the swap until
 * the uncover is over. Everything else runs: a scene that came in with a hard cut runs on its first
 * frame, so a level does the same with or without its transition.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const flushTransitionEnd = (store: TRuntimeStore): void => {
    const active = store.get('transition').active;
    flushSceneWaits(store, store.get('world').transitionEnd, (scene) => scene.held || active?.incoming === scene);
};
