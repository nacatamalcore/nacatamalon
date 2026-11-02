import { teardownBox } from '../box';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';
import { runningScene } from './find_scene';
import { markSceneStopped } from './stopped_scenes';
import { endTransition } from '../transition/end_transition';

/**
 * Takes a running scene out of the game: off `world.scenes`, then through its cleanups.
 *
 * In that order on purpose. A cleanup that looks at the game while it runs must not find the
 * scene still listed as running, or it could act on a scene that is already leaving.
 *
 * Takes effect at once: the tick checks the list again before updating each scene, so a scene
 * stopped from a `useUpdate` neither updates nor draws for the rest of that frame.
 *
 * @param scene Its name, or its root: by its root it is that scene and no other, even when another
 * running scene answers to the same name.
 * @returns Whether a scene was stopped. `false` means no such scene was running.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stopScene = (store: TRuntimeStore, scene: string | TBox): boolean => {
    const root = runningScene(store, scene);
    if (root === undefined) {
        return false;
    }

    // A transition that still names this scene has just lost one of its two ends, so it is dropped
    // rather than left pointing at a tree about to be torn down. This is the door a scene's removal
    // goes through, a host loading another scene among them, which is why the check belongs here
    // and not in the one caller that happens to be polite about it. (A game being destroyed tears
    // its scenes down directly, and steps no transition again.)
    //
    // The swap is not this case: it lets go of the scene it is stopping first, so by the time it
    // calls in here the transition names neither end.
    const transition = store.get('transition').active;
    if (transition !== null && (transition.incoming === root || transition.outgoing === root)) {
        if (transition.incoming !== null) {
            transition.incoming.held = false;
        }
        endTransition(store, transition);
    }

    store.setState('world', { scenes: store.get('world').scenes.filter((scene) => scene !== root) });
    // Before its cleanups, so one of them that makes something finds the scene already gone.
    markSceneStopped(root);
    teardownBox(root);
    return true;
};
