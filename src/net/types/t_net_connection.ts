/**
 * One line between a player's game and the server: what the engine asks of whatever carries the
 * messages. A WebSocket, socket.io, a WebRTC channel or the loopback in memory are all one of these
 * once wrapped, and the game above never knows which.
 *
 * Messages are text: the engine writes them as JSON and reads them back, so what a game sends has to
 * be something JSON can hold. The engine calls `onMessage` and `onClose` once each, when it takes
 * the connection, and `send` and `close` whenever it needs to.
 *
 * @example
 * ```ts
 * import type { TNetConnection } from 'nacatamalon/net';
 *
 * // What of socket.io's client this uses (`import type { Socket } from 'socket.io-client'`).
 * type Socket = {
 *     emit(event: string, text: string): void;
 *     on(event: string, listener: (value: string) => void): void;
 *     disconnect(): void;
 * };
 *
 * // A connection carried by socket.io, on an event of its own.
 * const overSocketIo = (socket: Socket): TNetConnection => ({
 *     send: (text) => socket.emit('naca', text),
 *     onMessage: (listener) => socket.on('naca', listener),
 *     onClose: (listener) => socket.on('disconnect', (reason) => listener(reason)),
 *     close: () => socket.disconnect(),
 * });
 * ```
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNetConnection = {
    /** Sends one message to the other end. One sent before the line is open waits until it is. */
    send(text: string): void;
    /** Who to tell each message that arrives, in the order they were sent. */
    onMessage(listener: (text: string) => void): void;
    /** Who to tell when the line is gone, from either end, with why when it is known. */
    onClose(listener: (reason?: string) => void): void;
    /** Ends the line. The other end hears it as closed. */
    close(reason?: string): void;
};
