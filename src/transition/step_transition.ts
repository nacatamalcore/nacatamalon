import type { TTransitionState } from './types/t_transition_state';

/**
 * What the frame has to do about the transition now that it has been moved on.
 *
 * `'swap'` is the only moment anything outside this function changes: the scene on its way out is
 * stopped and the one coming in is let go. It is asked for once in the life of a transition, or
 * twice for a scene restarting itself whose new copy, built at the first, still has something to
 * load: it is let go at the second.
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
    if (state.cross && state.phase === 'cover') {
        return crossOver(state, delta);
    }
    state.elapsed += delta;
    const through = moveOn(state);

    if (state.phase === 'cover') {
        // The two things it waits for, and it waits for the later of them: the screen has to be
        // covered, and what is about to be shown has to have arrived. That is what makes a
        // transition pay for itself twice, hiding the cut and hiding the load.
        if (through < 1 || !state.loaded) {
            return 'running';
        }

        state.phase = 'reveal';
        // The overshoot goes into the second half so the whole thing keeps to its duration, but it
        // is capped at one frame: when the cover was waiting on a slow load the overshoot is the
        // length of that wait, and carrying it would skip the uncover entirely.
        state.elapsed = Math.min(Math.max(0, state.elapsed - state.half), delta);
        moveOn(state);
        return 'swap';
    }

    // Marked, not removed. The frame that reaches the end still has to be drawn with the effect in
    // it, or the last cover anybody saw is the one before this: a few percent short of gone, which
    // a fade forgives and a wipe does not.
    if (through >= 1) {
        state.done = true;
    }
    return 'running';
};

/**
 * How long a transition that crosses waits for its picture of the scene going out, in seconds, once
 * everything else has arrived. Long past what any card takes to draw a frame and compile a hook: it
 * is only there so a card that never draws does not hold the change for ever. Past it, the change
 * is a cut.
 */
const PICTURE_WAIT = 1;

/**
 * The wait of a transition that crosses: nothing to cover, so it swaps as soon as what is coming in
 * has arrived and a picture of what is going out has been drawn, and its one run starts there.
 *
 * Its run does not start while it waits. The scene going out is still playing, and still being
 * shown as it is, so there is nothing yet for the time to be spent on. The clock only counts the
 * wait for the picture, against `PICTURE_WAIT`.
 */
const crossOver = (state: TTransitionState, delta: number): TTransitionStep => {
    if (!state.loaded) {
        return 'running';
    }
    // With no duration the swap frame is already the end, so the picture would never be seen. With
    // the picture kept and the clock at its end, it is a restart waiting for its new copy after a
    // swap that was a cut.
    let cut = state.half === 0 || (state.effect.outgoing === 'keep' && state.elapsed >= state.half);
    if (state.effect.outgoing === 'take' && !cut) {
        state.elapsed += delta;
        if (state.elapsed < PICTURE_WAIT) {
            return 'running';
        }
        cut = true;
    }
    state.phase = 'reveal';
    // From nothing on the swap frame: the scene coming in is drawn there for the first time, and
    // showing none of it yet is what makes the last picture of the old one and the first of the run
    // the same. A cut goes straight to the end instead: with no picture of the old scene, or a hook
    // still compiling, anything in between would show the new scene, then the old, then the new.
    state.elapsed = cut ? state.half : 0;
    if (state.effect.outgoing !== undefined) {
        state.effect.outgoing = 'keep';
    }
    moveOn(state);
    return 'swap';
};

/**
 * Works out `progress` from the clock, through the transition's curve, and gives back how far
 * through the half the clock itself is.
 *
 * The two are kept apart on purpose. The swap and the end are the clock's to decide, so a curve can
 * change how the cover moves but never how long it lasts; and what the shader is handed is kept
 * between 0 and 1, so a curve that overshoots holds at the end instead of going past it.
 */
const moveOn = (state: TTransitionState): number => {
    // A transition with no duration is always at its end, so it covers for exactly as long as the
    // incoming scene takes to load and not one frame more.
    const through = state.half > 0 ? Math.min(1, state.elapsed / state.half) : 1;
    // The ends are the clock's too: a curve of your own that does not quite reach 1 must not leave
    // the swap or the last frame a little short, and one that gives no number is a straight line.
    const curved = state.ease === null || through >= 1 ? through : state.ease(through);
    state.progress = Number.isFinite(curved) ? Math.min(1, Math.max(0, curved)) : through;
    return through;
};
