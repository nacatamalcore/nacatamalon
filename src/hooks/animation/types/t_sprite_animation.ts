import type { TClipEvent } from '../../../animation';

/**
 * One named run of frames: which pictures, how fast, and whether it starts again at the end.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TAnimationClip = {
    /**
     * The frames of the sheet to show, in order. They may repeat and go backwards.
     */
    frames: readonly number[];
    /**
     * Frames per second. Default `12`, which is the usual pace for hand-drawn movement.
     */
    fps?: number;
    /**
     * Whether it starts again at the end. Default `true`.
     */
    loop?: boolean;
    /**
     * Moments inside the run worth being told about: the picture a blow lands on, a footstep.
     *
     * **`at` is the place in this run, counting from `0`, not the number of the picture on the
     * sheet.** A run is allowed to show the same picture twice (`[4, 5, 6, 5, 4]`), and the two
     * showings are not the same moment: one is the swing going out and the other is it coming
     * back. Counting places is the only way to tell them apart.
     */
    events?: readonly TClipEvent[];
    /**
     * The run to play when this one ends, for one that does not loop: a punch that drops back to
     * standing. A name there is no run for is said once, and the run rests on its last picture.
     */
    next?: string;
};

/**
 * What `useSpriteAnimation` is asked for.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteAnimationOptions = {
    /**
     * The runs this sprite knows, by name: walking, attacking, dying.
     */
    clips: Readonly<Record<string, TAnimationClip>>;
    /**
     * Which one to start with. Left out, the sprite stays on the frame it was created with.
     */
    play?: string;
    /**
     * A multiplier on every clip's speed: `2` twice as fast, `0.5` half. Default `1`.
     */
    speed?: number;
};

/**
 * The controls for one animated sprite, returned by `useSpriteAnimation`.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteAnimation = {
    /**
     * Starts a run from its first frame. Starting the one already playing restarts it.
     */
    play(clip: string): void;
    /**
     * Stops where it is, leaving the frame on screen.
     */
    stop(): void;
    /**
     * Changes how fast every run of this sprite goes from now on.
     */
    setSpeed(speed: number): void;
    /**
     * Whether a run is going right now. False once a clip that does not loop has finished.
     */
    readonly playing: boolean;
    /**
     * Which run is on, or `null` if none ever started.
     */
    readonly clip: string | null;
    /**
     * Which frame of the sheet is showing.
     */
    readonly frame: number;
    /**
     * Tells you when a run that does not loop reaches its end: a death, a blow, a chest opening.
     * Hand back what it returns to stop being told.
     *
     * A run stopped by `stop` has not reached its end, and does not tell anybody.
     */
    onEnd(listener: (clip: string) => void): () => void;
    /**
     * Tells you when the run passes one of the moments marked on it, handing over what that moment
     * is called and which run it was in. Hand back what it returns to stop being told.
     *
     * One listener for every mark, rather than one per name: what a mark means is the game's to
     * decide, and deciding it in one place is what keeps that decision out of the animation.
     */
    onEvent(listener: (event: string, clip: string) => void): () => void;
};
