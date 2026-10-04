import type { TTransitionState } from './types/t_transition_state';

/**
 * What the frame has to do about the transition now that it has been moved on.
 *
 * `'swap'` is asked for once in the life of a transition and is the only moment anything outside
 * this function changes: the scene on its way out is stopped and the one coming in is let go.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTransitionStep = 'running' | 'swap';

/**
 * Moves a transition on by one frame.
 *
 * Pure arithmetic on the record it is given: it stops no scene, touches no store and draws nothing,
 * so the whole of the timing can be tested without a game around it. Whoever calls it owns the one
 * side effect, and is told when to do it.
 *
 * **The delta it wants is the unscaled one.** A hit-stop at a tenth of speed must not stretch a
 * 300ms cut into three seconds, and at a standstill it would never come off the screen at all.
 *
 * @param state The transition in flight, moved on in place.
 * @param delta Seconds since the last frame, **not** scaled by `timeScale` and not stopped by a
 * pause. The screen has to uncover whatever the rest of the game is doing.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stepTransition = (state: TTransitionState, delta: number): TTransitionStep => {
    state.elapsed += delta;
    // A transition with no duration is always at its end, so it covers for exactly as long as the
    // incoming scene takes to load and not one frame more.
    state.progress = state.half > 0 ? Math.min(1, state.elapsed / state.half) : 1;

    if (state.phase === 'cover') {
        // The two things it waits for, and it waits for the later of them: the screen has to be
        // covered, and what is about to be shown has to have arrived. That is what makes a
        // transition pay for itself twice, hiding the cut and hiding the load.
        if (state.progress < 1 || !state.loaded) {
            return 'running';
        }

        state.phase = 'reveal';
        // The overshoot goes into the second half so the whole thing keeps to its duration, but it
        // is capped at one frame: when the cover was waiting on a slow load the overshoot is the
        // length of that wait, and carrying it would skip the uncover entirely.
        state.elapsed = Math.min(Math.max(0, state.elapsed - state.half), delta);
        state.progress = state.half > 0 ? Math.min(1, state.elapsed / state.half) : 1;
        return 'swap';
    }

    // Marked, not removed. The frame that reaches the end still has to be drawn with the effect in
    // it, or the last cover anybody saw is the one before this: a few percent short of gone, which
    // a fade forgives and a wipe does not.
    if (state.progress >= 1) {
        state.done = true;
    }
    return 'running';
};
