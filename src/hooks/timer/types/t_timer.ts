/**
 * One waiting call, handed back by `after` and `every` so it can be called off.
 *
 * @category Lifecycle
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTimerHandle = {
    /**
     * Calls it off. Nothing more runs, and calling it twice is harmless.
     */
    cancel(): void;
    /**
     * Whether it is over: an `after` that has run, or anything cancelled. An `every` is never done on its own.
     */
    readonly done: boolean;
};

/**
 * What `useTimer` hands back: the two ways of running something later.
 *
 * @category Lifecycle
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTimer = {
    /**
     * Runs `fn` once, `seconds` from now. `0` means on the next frame.
     *
     * @param seconds How long to wait, in game seconds.
     * @param fn What to run.
     * @returns A handle, to call it off.
     */
    after(seconds: number, fn: () => void): TTimerHandle;
    /**
     * Runs `fn` every `seconds`, the first time `seconds` from now, until it is cancelled or the
     * object that asked for it goes.
     *
     * @param seconds How long between calls, in game seconds. Must be more than zero.
     * @param fn What to run.
     * @returns A handle, to stop it.
     */
    every(seconds: number, fn: () => void): TTimerHandle;
    /**
     * Calls off everything this timer has waiting, which is how a sequence starts over.
     */
    cancelAll(): void;
};
