import { endTransition, rebuildBehindCover, stepTransition } from '../../../transition';
import { stopScene } from '../../../scene';
import type { TRuntimeStore } from '../../../store';

/**
 * Moves the scene change being covered on by one frame, and does the one thing it asks for.
 *
 * The arithmetic is not here: `stepTransition` owns that and owns nothing else, so the timing can
 * be tested with no game around it. What is here is the side effect it cannot have, at the swap:
 * the scene coming in is let go and the one going out is stopped, cleanups and all. A scene
 * restarting itself is built there too, once the old copy has stopped: see `rebuildBehindCover`.
 *
 * Run **before** the updates, so the cover is sized for the frame about to be produced rather than
 * for the one before it. That ordering is also what makes the swap frame clean: the scene coming in
 * is released before the updates walk the list, so it updates and draws on that very frame, under a
 * cover that was just reset to the start of its uncover and is therefore still closed.
 *
 * @param store The runtime store of the game being stepped.
 * @param delta Seconds since the last frame, unscaled and not stopped by a pause.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const stepGameTransition = (store: TRuntimeStore, delta: number): void => {
    const state = store.get('transition').active;
    if (state === null) {
        return;
    }

    // Taken away at the start of the frame **after** the one that finished it. The frame that
    // reached the end still had the effect in it, so the last thing anybody saw was the cover
    // fully gone rather than a few percent of it left behind.
    if (state.done) {
        endTransition(store, state);
        return;
    }
    // Not started until its mask has landed: a cover that began with half a shape would show the
    // shape arriving rather than the screen being covered. The scene going out goes on meanwhile.
    if (state.effect.mask?.status === 'loading') {
        return;
    }

    if (stepTransition(state, delta) === 'swap') {
        // A scene restarting itself has nothing coming in yet: it is built now.
        if (state.rebuild !== null) {
            rebuildBehindCover(store, state);
            return;
        }
        if (state.incoming !== null) {
            state.incoming.held = false;
        }
        // Let go of before it is stopped, so that `stopScene` sees a transition that no longer
        // names it and leaves the transition alone. Its cleanups run here, at the swap, and not
        // back when `change` was called: a scene leaves when it stops being seen.
        const leaving = state.outgoing;
        state.outgoing = null;
        if (leaving !== null) {
            stopScene(store, leaving);
        }
    }
};
