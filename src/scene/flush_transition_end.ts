import { sceneOf } from '../box/scene_of';
import { isSceneStopped } from './stopped_scenes';
import { withActiveBox } from '../store/active_box';
import { withActiveGame } from '../store/active_game';
import { reportFrameError } from '../game/loop/report_frame_error';
import type { TRuntimeStore } from '../store';

/**
 * Runs what `useSceneTransitionEnd` set aside whose scene is now on screen with nothing over it.
 *
 * A scene is waiting while it is held (behind a transition, or behind the splash before its fade
 * starts) and while it is the one a transition is bringing in, which goes on after the swap until
 * the uncover is over. Everything else runs: a scene that came in with a hard cut runs on its first
 * frame, so a level does the same with or without its transition.
 *
 * Each callback runs with its own box active, as `useReady` does. A callback whose box was destroyed
 * meanwhile, or whose scene stopped before it was seen, is dropped. One that throws is reported as a
 * failed frame and costs only itself.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const flushTransitionEnd = (store: TRuntimeStore): void => {
    const waiting = store.get('world').transitionEnd;
    if (waiting.length === 0) {
        return;
    }

    const active = store.get('transition').active;
    // Taken out before any of them runs, so one that sets aside another waits for the next frame
    // rather than running in this same pass with the list moving under it.
    const due: typeof waiting = [];
    const kept: typeof waiting = [];
    for (const entry of waiting) {
        // A scene that stops is not marked destroyed, its boxes are only torn down: it is asked.
        const scene = sceneOf(entry.box);
        if (entry.box.destroyed || isSceneStopped(scene)) continue;
        (scene.held || active?.incoming === scene ? kept : due).push(entry);
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
