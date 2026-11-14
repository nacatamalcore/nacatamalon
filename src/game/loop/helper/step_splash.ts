import { type TRuntimeStore, withSceneUpdates } from '../../../store';
import type { TBox } from '../../../box';
import { runHookUpdates, runLateUpdates, runMoves } from '../runHookUpdates';
import { runCollisions } from '../../../hitbox/run_collisions';
import { reportFrameError } from '../report_frame_error';
import { splashOf } from '../../../splash/behind_splash';

/**
 * Moves the splash on by one frame: its updates, by the frame as it really was.
 *
 * On its own and not with the game's scenes, which skip it, for the reason the transition is: it
 * has to come off the screen whatever the game behind it does. A game paused from a scene's body,
 * or with its time stopped, would otherwise keep the splash up for good, with nothing seen to get
 * out of it.
 *
 * @param store The runtime store of the game being stepped.
 * @param delta Seconds since the last frame, unscaled and not stopped by a pause.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stepSplash = (store: TRuntimeStore, delta: number): void => {
    const splash = splashOf(store);
    if (splash === null || !store.get('world').scenes.includes(splash)) {
        return;
    }
    withSceneUpdates(store, () => {
        try {
            const late: TBox[] = [];
            const touching: TBox[] = [];
            const moving: TBox[] = [];
            const reached = new Set<TBox>();
            runHookUpdates(splash, delta, undefined, late, touching, moving, reached);
            runMoves(moving, delta, splash.time);
            runCollisions(splash, touching, reached);
            runLateUpdates(late, delta, splash.time);
        } catch (error) {
            reportFrameError(store, error);
        }
    });
};
