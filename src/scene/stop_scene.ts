import { teardownBox } from '../box';
import type { TRuntimeStore } from '../store';
import { findScene } from './find_scene';

/**
 * Takes a running scene out of the game: off `world.scenes`, then through its cleanups.
 *
 * In that order on purpose. A cleanup that looks at the game while it runs must not find the
 * scene still listed as running, or it could act on a scene that is already leaving.
 *
 * Takes effect at once: the tick checks the list again before updating each scene, so a scene
 * stopped from a `useUpdate` neither updates nor draws for the rest of that frame.
 *
 * @returns Whether a scene was stopped. `false` means no scene with that name was running.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stopScene = (store: TRuntimeStore, name: string): boolean => {
    const root = findScene(store, name);
    if (root === undefined) {
        return false;
    }

    // A transition that still names this scene has just lost one of its two ends, so it is dropped
    // rather than left pointing at a tree about to be torn down. This is the door every removal
    // goes through, including a game being destroyed and a host loading another scene, which is
    // why the check belongs here and not in the one caller that happens to be polite about it.
    //
    // The swap is not this case: it lets go of the scene it is stopping first, so by the time it
    // calls in here the transition names neither end.
    const transition = store.get('transition').active;
    if (transition !== null && (transition.incoming === root || transition.outgoing === root)) {
        transition.incoming.held = false;
        store.setState('transition', { active: null });
    }

    store.setState('world', { scenes: store.get('world').scenes.filter((scene) => scene !== root) });
    teardownBox(root);
    return true;
};
