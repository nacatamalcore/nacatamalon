import { sceneOf } from '../box/scene_of';
import { isSceneStopped } from './stopped_scenes';
import { withActiveBox } from '../store/active_box';
import { withActiveGame } from '../store/active_game';
import { reportFrameError } from '../game/loop/report_frame_error';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';

/**
 * Runs what was set aside until its scene got somewhere, and keeps what is still waiting.
 *
 * Each callback runs with its own box active. One whose box was destroyed meanwhile, or whose scene
 * stopped (a scene that stops is not marked destroyed, its boxes are only torn down), is dropped.
 * One that throws is reported as a failed frame and costs only itself.
 *
 * @param waiting The list, emptied of what runs. Mutated in place.
 * @param waits Whether a scene is still not where its callbacks wait for it to be.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const flushSceneWaits = (
    store: TRuntimeStore,
    waiting: Array<{ box: TBox; run: () => void }>,
    waits: (scene: TBox) => boolean,
): void => {
    if (waiting.length === 0) {
        return;
    }

    // Taken out before any of them runs, so one that sets aside another waits for the next frame
    // rather than running in this same pass with the list moving under it.
    const due: typeof waiting = [];
    const kept: typeof waiting = [];
    for (const entry of waiting) {
        const scene = sceneOf(entry.box);
        if (entry.box.destroyed || isSceneStopped(scene)) continue;
        (waits(scene) ? kept : due).push(entry);
    }
    waiting.splice(0, waiting.length, ...kept);

    for (const { box, run } of due) {
        try {
            withActiveGame(store, () => withActiveBox(store, box, run));
        } catch (error) {
            reportFrameError(store, error);
        }
    }
};
