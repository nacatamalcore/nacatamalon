/**
 * A function that is told a signal fired, with whatever the signal carries.
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSignalHandler<T> = (payload: T) => void;

/**
 * A channel one part of the game fires and any other part listens to, without either knowing the
 * other exists. Made with `createGameSignal`.
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameSignal<T = void> = {
    /**
     * Tells everyone listening, right now: by the time `emit` returns, they have all reacted.
     */
    emit(payload: T): void;
    /**
     * Starts listening. Returns the function that stops. Inside a scene prefer `useSignal`, which
     * stops by itself when the scene goes away.
     */
    connect(handler: TSignalHandler<T>): () => void;
    /**
     * How many are listening. Useful to spot a listener that was never disconnected.
     */
    readonly size: number;
};
