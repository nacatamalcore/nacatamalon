import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';
import { runningScene } from './find_scene';
import { gameMoment } from '../signal/game_moments';

/**
 * The scene whose pause is being told, while it is. The moment is named after the scene, and two
 * running scenes can answer to one name: a listener that wants its own scene and no other asks this.
 */
let telling: TBox | null = null;

/**
 * The scene whose pause or resume the moment being told is about, or `null` outside one.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const scenePauseTold = (): TBox | null => telling;

/**
 * Freezes or unfreezes one running scene. A paused scene skips its `useUpdate` callbacks but keeps
 * drawing, which is what a pause menu over a frozen level needs.
 *
 * Independent of `loop.pausedBy`, which freezes the whole game: resuming the game does not resume a
 * scene paused on its own, and the other way round.
 *
 * @param scene Its name, or its root: by its root it is that scene and no other, even when another
 * running scene answers to the same name.
 * @returns Whether the scene is paused now. `false` also when no such scene is running.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setScenePaused = (store: TRuntimeStore, scene: string | TBox, paused: boolean): boolean => {
    const root = runningScene(store, scene);
    if (root === undefined) {
        return false;
    }
    // Only when it really changes: pausing what is already paused is not an event.
    if (root.paused !== paused) {
        root.paused = paused;
        // Heard through `useScene().onPaused` and `onResumed`.
        const before = telling;
        telling = root;
        try {
            gameMoment(store, `${paused ? 'scene paused' : 'scene resumed'}: ${root.name}`).emit();
        } finally {
            telling = before;
        }
    }
    return root.paused;
};

/**
 * Whether a scene, by its name or its root, is running and paused. A scene that is not running is
 * not paused.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isScenePaused = (store: TRuntimeStore, scene: string | TBox): boolean => runningScene(store, scene)?.paused ?? false;
