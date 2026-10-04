import { type TRuntimeStore, withSceneUpdates } from "../../store";
import type { TFrameContext } from "../../render";
import { fillFrameContext } from "./fill_frame_context";
import { MAX_FRAME_DELTA } from "../../CONFIG";
import { runHookUpdates as runUpdates } from "./runHookUpdates";
import { stepGameTransition } from "./helper/step_game_transition";
import { flushDestroyed } from "../../destroy";
import { updateAudio } from "../../audio";
import { settleCapture } from "../capture";
import { reportFrameError } from "./report_frame_error";

/**
 * Tick one frame of the game loop.
 *
 * @param store The runtime store of the game this loop belongs to. Read on every frame, never
 * cached, so a change made between two frames is seen on the next one.
 * @param ctx The frame context, created once and reused on every frame. It is filled from the
 * store and handed to the renderer: the only object that crosses to it.
 * @param now This frame's timestamp in milliseconds. The one `requestAnimationFrame` hands
 * over, on the same clock as `performance.now()`.
 * @param prev The previous frame's timestamp in milliseconds, used to measure `dt`. On the
 * first call it equals `now`, so the first frame gets `dt = 0`.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
/**
 * How much each new frame counts in the average. About a second's worth of frames at 60 fps are
 * felt in it, which is steady enough to read on a panel and quick enough to show a drop.
 */
const FPS_WEIGHT = 0.05;

/**
 * Folds one frame into the average. From the raw time between frames, not the clamped `dt`: this
 * measures the machine, so a hitch has to show as the hitch it was.
 */
const measureFps = (store: TRuntimeStore, elapsedMs: number): void => {
    if (elapsedMs <= 0) {
        return;
    }
    const { fps } = store.get('stats');
    const now = 1000 / elapsedMs;
    store.setState('stats', { fps: fps === 0 ? now : fps + (now - fps) * FPS_WEIGHT });
};

export const tick = (store: TRuntimeStore, ctx: TFrameContext, now: number, prev: number): void => {

    // Prevent to continue if the game has been destroyed.
    if (store.get('loop').destroyed) {
        return;
    }

    // Schedule the next frame first, so an error below does not stop the loop.
    requestAnimationFrame((next) => tick(store, ctx, next, now));

    // Clicks and touches that arrived since the last frame, handed to their listeners now, before
    // any update: at a moment the game chose, not whenever the DOM fired. Outside the pause check,
    // because a pause menu has to be clickable; a paused scene's own listeners are skipped inside.
    store.get('input').pointer.dispatch(store);

    // A pad sends no events: it can only be asked how it is, and "just pressed" is the difference
    // between this answer and the last one. So it is asked **every** frame, paused or not: a game
    // that stopped asking would report everything the player did in the menu as pressed on the
    // frame it resumes, and the pause menu could never be a pad away from unpausing.
    const input = store.get('input');
    input.gamepads.beginFrame();
    input.actions.sample();

    const { pausedBy, timeScale, step } = store.get('loop');
    // A host stepping a paused game one frame at a time: this frame runs, by exactly the time it
    // asked for, and the game stays paused. See `TEditorHandle.stepFrame`.
    const stepping = pausedBy.length > 0 && step !== null;
    if (step !== null) {
        store.setState('loop', { step: null });
    }
    const paused = pausedBy.length > 0 && !stepping;
    // The frame as it really was, before the game got to slow it down or stop it. Only the
    // transition reads this one, and it is the whole reason it exists: a hit-stop at a tenth of
    // speed must not stretch a 300ms cut into three seconds, and at a standstill the screen would
    // stay covered for good.
    const unscaled = Math.min(Math.max(0, now - prev) / 1000, MAX_FRAME_DELTA);
    // Measured once and shared with the drawing half, because particles are moved there: they are
    // born where their emitter ended up, which is only known after the tree has been walked.
    const dt = paused ? 0 : (stepping ? step! : unscaled) * timeScale;
    measureFps(store, now - prev);

    // Before the updates, so the cover is sized for the frame about to be drawn and not for the
    // one before it. Outside the pause check, and deliberately: the invariant worth keeping is
    // that the screen always uncovers. A transition frozen at full cover has no pause menu
    // visible to get out of it, so it would be a lock-up with nothing to show for itself.
    stepGameTransition(store, unscaled);

    if (!paused) {
        // Marked as walking the tree for as long as the updates run, so a `destroy` asking to
        // take something out on the spot is queued instead of cutting under the walk.
        withSceneUpdates(store, () => {
            for (const scene of [...store.get('world').scenes]) {
                // Looked up again because the copy can be stale: an earlier scene may have stopped this
                // one during this same frame, and `stop` has to take effect when it is asked for.
                // A paused scene is skipped here and only here: it stays in the list, so it still draws.
                // A held one is skipped everywhere: it is waiting behind a transition and is not
                // being seen, so a frame of it would be a frame it arrives already late by.
                if (!store.get('world').scenes.includes(scene) || scene.paused || scene.held) {
                    continue;
                }
                // One scene at a time, so a script that throws costs its own scene and not the
                // others, nor the picture: see `TRuntimeState.loop.failure`.
                try {
                    runUpdates(scene, dt);
                } catch (error) {
                    reportFrameError(store, error);
                }
            }
        });
    }

    // Closed after every update has run, so one press reads as pressed for every object that
    // asks this frame, and for none of them the next. The DOM has no notion of a frame, so this
    // line is what one means here.
    store.get('input').keyboard.endFrame();

    // The one moment of the frame when nobody is reading the tree: the updates are over and
    // nothing has been drawn yet, so what was destroyed leaves without a last appearance.
    // Outside the pause check on purpose: a destroy can come from a timer or a click while the
    // game is paused, and it should not sit in the queue until the game resumes.
    flushDestroyed(store);
    
    // An update may have destroyed the game: the renderer would already be gone.
    if (store.get('loop').destroyed) {
        return;
    }

    // The listener and the sounds placed in the world follow what is on screen, paused or not:
    // moving them is not simulating anything. Returns at once in a game with no sound.
    updateAudio(store);

    // The clock every shader that animates reads. Kept on the frame context and nowhere else, which
    // is what `TRuntimeState.loop` says: it changes sixty times a second and nothing subscribes to
    // it, so a store section holding it would wake every listener of that section on every frame.
    //
    // It is **game time**: scaled by `timeScale` and stopped by a pause, because a frozen game whose
    // lava went on boiling would be a game only half paused. The one clock that is not this one is
    // the transition's, which has to come off the screen whatever the rest of the game is doing.
    ctx.time += dt;

    // Draw even when paused.
    try {
        fillFrameContext(store, ctx, dt);
        store.get('screen').renderer.frame(ctx);
    } catch (error) {
        // A capture drawn in this frame was not drawn, and has to hear so.
        settleCapture(store, error);
        throw error;
    }
    settleCapture(store);

};
