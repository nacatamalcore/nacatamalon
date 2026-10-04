/**
 * Something that happens at a point inside a movement, rather than at its end: the moment a sword
 * becomes dangerous, a foot meets the ground, a spell leaves the hand.
 *
 * It is a **cue, not a consequence**: the movement says when, and the game decides what that means.
 * That split is what lets the same swing be a hit, a parry or a miss without the animation knowing
 * which, and it is why nothing here names a function.
 *
 * Used by both halves of the engine. What `at` counts differs, because the two kinds of movement
 * are measured differently, and each says so where it is taken.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TClipEvent = {
    /**
     * Where in the movement it happens. Its unit is the one the movement is measured in.
     */
    at: number;
    /**
     * What it is called, which is what the listener is handed.
     */
    name: string;
};
