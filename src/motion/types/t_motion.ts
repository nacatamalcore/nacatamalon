import type { TMotionFile } from '../../loaders/motion/types/t_motion_file';

/**
 * How `useMotion` is asked to play.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionOptions = {
    /**
     * Starts as soon as the file is here. Default `false`.
     */
    autoplay?: boolean;
    /**
     * Starts again from the beginning once it ends. Default: what the file says.
     */
    loop?: boolean;
    /**
     * How fast it plays: `2` twice as fast, `0.5` at half speed. Default `1`.
     */
    speed?: number;
    /**
     * Its id, the one a saved scene writes it under. Made up when not given.
     */
    id?: string;
};

/**
 * The controls of a motion playing on a box, handed back by `useMotion`.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionHandle = {
    /**
     * Plays it from the beginning, whether it was playing, paused or over.
     */
    play(): void;
    /**
     * Holds it where it is. The fields it moves stay as they are until `resume`.
     */
    pause(): void;
    /**
     * Carries on from where `pause` left it.
     */
    resume(): void;
    /**
     * Stops it and goes back to the beginning, leaving the fields where they were. `onEnd` does not
     * run: nothing finished.
     */
    stop(): void;
    /**
     * Puts it at a moment, in seconds, and the fields with it on the next frame. What happens on the
     * way there (a sound, a mark) does not: only what is played past happens.
     */
    seek(seconds: number): void;
    /**
     * Calls `listener` every time the motion is played past a mark with this name. Hands back what
     * stops listening.
     */
    on(mark: string, listener: () => void): () => void;
    /**
     * Calls `listener` every time it reaches its end without looping. Hands back what stops listening.
     */
    onEnd(listener: () => void): () => void;
    /**
     * Where it is, in seconds from the beginning.
     */
    readonly time: number;
    /**
     * How long it lasts, `0` until the file is here.
     */
    readonly duration: number;
    readonly playing: boolean;
};

/**
 * A motion a box carries: its file and how it was asked to play. What a saved scene writes as a
 * `motion` component; never where it had got to.
 *
 * @category Animation
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMotionAttachment = {
    type: 'motion';
    id: string;
    file: TMotionFile;
    autoplay: boolean;
    /**
     * `null` for what the file says.
     */
    loop: boolean | null;
    speed: number;
};
