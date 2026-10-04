import type { TBox } from '../../box';
import type { TPostEffect } from '../../post/types/t_post_effect';

/**
 * Which half of a transition is running.
 *
 * `'cover'` hides what is there, `'reveal'` shows what replaced it. The shader is told as a number
 * (0 and 1) because a shader cannot branch on a word, but everywhere above the card it is spelled
 * out: a comparison against `'cover'` says what it means and a comparison against `0` does not.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTransitionPhase = 'cover' | 'reveal';

/**
 * A transition in flight. One at a time, and the game holds at most one.
 *
 * **It belongs to the screen and not to a scene.** Covering is something that happens to the
 * picture, so a HUD launched alongside the level is covered by it too, and a transition cannot be
 * owned by either of the two scenes it is between: one of them is about to stop.
 *
 * `effect` is built **once** and kept: a compiled shader is cached against that object's identity,
 * so a fresh one each frame would compile each frame and never once find the cache.
 *
 * @category Scenes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTransitionState = {
    /**
     * The full-screen effect that draws it, first in the chain and installed nowhere: it is not
     * something the game asked for, so it is never in `post.effects` and nothing can take it out.
     */
    effect: TPostEffect;
    /**
     * How long **one half** lasts, in seconds. Half of what the author wrote, in the other unit.
     */
    half: number;
    /**
     * Seconds into the current half. Reset at the swap, carrying at most one frame of overshoot.
     */
    elapsed: number;
    /**
     * How far through the current half, 0 to 1. Worked out by the step and read by the frame, so
     * the number the shader is given and the number the swap was decided on are the same one.
     */
    progress: number;
    phase: TTransitionPhase;
    /**
     * The scene coming in. It is running from the moment `change` was called, so its loading has
     * started, but it is **held**: it neither updates, nor draws, nor answers the pointer.
     */
    incoming: TBox;
    /**
     * The scene on its way out, which keeps running normally until the swap.
     *
     * **Nulled at the swap, the moment it is stopped**, and that is not tidiness. It says in the
     * record itself that the transition has no further business with it, which is what lets
     * `stopScene` clear a transition whose ends are being torn down without having to work out
     * whether the stop it is looking at *is* the swap. It also lets go of a whole scene tree that
     * would otherwise be held alive until the uncover finished.
     */
    outgoing: TBox | null;
    /**
     * Whether everything `incoming` asked to load has settled. The other half of what the swap waits for.
     */
    loaded: boolean;
    /**
     * Set when the uncover reached its end, and read at the **start** of the next frame to take the
     * transition away.
     *
     * A frame of delay on purpose. Removing it in the same step that finished it would mean the
     * frame at full progress is drawn with no effect at all, so the last cover anybody saw was the
     * one before it: a few percent short, which a fade forgives and a wipe does not.
     */
    done: boolean;
};
