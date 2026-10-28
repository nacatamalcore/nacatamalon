import { sceneOf } from '../box/scene_of';
import { flushSceneWaits } from './flush_scene_waits';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';

/**
 * Runs `run` now if the scene `box` is in is not held, or at the start of the first frame after it
 * is let go: the swap of the transition bringing it in, or the splash stepping aside.
 *
 * For what a held scene must not start on its own while nobody sees it, because it keeps real time
 * rather than the scene's: a sound set to `autoplay`, which would otherwise begin under the cover,
 * over the music of the scene still on screen. Never run if the scene stops first.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const whenReleased = (store: TRuntimeStore, box: TBox, run: () => void): void => {
    if (!sceneOf(box).held) {
        run();
        return;
    }
    store.get('world').released.push({ box, run });
};

/**
 * Runs what `whenReleased` set aside whose scene has been let go.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const flushReleased = (store: TRuntimeStore): void => {
    flushSceneWaits(store, store.get('world').released, (scene) => scene.held);
};
