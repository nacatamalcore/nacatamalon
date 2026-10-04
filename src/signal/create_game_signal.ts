import type { TGameSignal, TSignalHandler } from './types/t_game_signal';

/**
 * Makes a signal: a way for one part of the game to say "this happened" and for any other part to
 * react, without the two knowing about each other.
 *
 * A button does not need to know about the screen that lights up, and the screen does not need to
 * know about the button: both know the signal. That is what keeps them apart, so either can be
 * changed, removed or duplicated without touching the other.
 *
 * Make it once, in a file of its own, and import it wherever it is needed. It belongs to the page,
 * not to a game, so it can be fired from outside the canvas too (a web page button, a tool).
 *
 * - `emit(value)` tells everyone listening, straight away.
 * - `useSignal(signal, handler)` listens from a scene, and stops by itself when the scene goes.
 * - `connect(handler)` listens from anywhere else, and returns the function that stops.
 *
 * A signal carries events, not state: nothing is kept after `emit`. What should still be true later
 * (a score, a level reached) belongs in the game's state, not here.
 *
 * @returns The signal. Give it the type of what it carries, or nothing if it carries nothing.
 *
 * @example
 * ```ts
 * let score = 0;
 *
 * // events.ts
 * export const coinCollected = createGameSignal<number>();
 *
 * // coin.ts
 * coinCollected.emit(10);
 *
 * // hud.ts, inside a scene
 * useSignal(coinCollected, (points) => { score += points; });
 * ```
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createGameSignal = <T = void>(): TGameSignal<T> => {
    // A list and not a set: the same function connected twice is two connections, each removed by
    // its own disconnect, which is what a caller who connected twice expects.
    let handlers: TSignalHandler<T>[] = [];

    return {
        emit: (payload: T) => {
            // A copy: a handler may disconnect itself, connect another or emit again while this runs.
            // One connected during this emit does not hear it.
            for (const handler of [...handlers]) {
                // One that was disconnected by an earlier handler of this same emit is not called.
                if (!handlers.includes(handler)) {
                    continue;
                }
                try {
                    handler(payload);
                } catch (error) {
                    // One broken listener must not silence the rest.
                    console.warn('[NacatamalOn] A signal handler threw:', error);
                }
            }
        },

        connect: (handler: TSignalHandler<T>) => {
            // Wrapped so this connection is its own entry, even for a function already listening.
            const connection: TSignalHandler<T> = (payload) => handler(payload);
            handlers.push(connection);
            return () => {
                handlers = handlers.filter((existing) => existing !== connection);
            };
        },

        get size() {
            return handlers.length;
        },
    };
};
