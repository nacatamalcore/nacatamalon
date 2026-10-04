import type { TRuntimeStore } from '../store';
import { findScene } from './find_scene';
import { scenePaused, sceneResumed } from '../signal/engine_signals';

/**
 * Freezes or unfreezes one running scene. A paused scene skips its `useUpdate` callbacks but keeps
 * drawing, which is what a pause menu over a frozen level needs.
 *
 * Independent of `loop.pausedBy`, which freezes the whole game: resuming the game does not resume a
 * scene paused on its own, and the other way round.
 *
 * @returns Whether the scene is paused now. `false` also when no scene with that name is running.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setScenePaused = (store: TRuntimeStore, name: string, paused: boolean): boolean => {
    const root = findScene(store, name);
    if (root === undefined) {
        return false;
    }
    // Only when it really changes: pausing what is already paused is not an event.
    if (root.paused !== paused) {
        root.paused = paused;
        (paused ? scenePaused : sceneResumed).emit({ scene: name });
    }
    return root.paused;
};

/**
 * Whether the scene called `name` is running and paused. A scene that is not running is not paused.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isScenePaused = (store: TRuntimeStore, name: string): boolean => findScene(store, name)?.paused ?? false;
