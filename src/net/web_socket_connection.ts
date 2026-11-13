import type { TNetConnection } from './types/t_net_connection';

/**
 * The part of a WebSocket this needs: the browser's, Bun's and Node's all have it.
 */
type TSocketLike = {
    readonly readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: { data?: unknown; reason?: string }) => void): void;
};

/** `WebSocket.OPEN`, written out: Node's has no static of it on every version. */
const OPEN = 1;
/** `WebSocket.CONNECTING`. */
const CONNECTING = 0;

/** The most a close's reason may weigh, in UTF-8 bytes: a browser refuses one over 123. */
const MOST_REASON_BYTES = 123;

/**
 * A message as text. A browser's socket hands text over as a string; some servers' sockets hand
 * the same text over as its bytes (Bun's `ws`, a `Buffer`), read here as UTF-8.
 */
const textOf = (data: unknown): string | null => {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return decoder.decode(data);
    if (ArrayBuffer.isView(data)) return decoder.decode(data);
    return null;
};

const decoder = new TextDecoder();

/** A reason cut to what a WebSocket carries, whole letters only. */
const shortReason = (reason: string | undefined): string | undefined => {
    if (reason === undefined) return undefined;
    const encoder = new TextEncoder();
    let kept = reason;
    while (encoder.encode(kept).length > MOST_REASON_BYTES) kept = [...kept].slice(0, -1).join('');
    return kept;
};

/**
 * A WebSocket as a connection the engine can use: the browser's, Bun's or Node's, made by the game
 * itself (to pass headers of its own, or a protocol). `useNet().connect('wss://…')` makes one of
 * these on its own; this is for a socket made elsewhere.
 *
 * What is sent before the socket opens waits and goes as soon as it does, in order.
 *
 * @example
 * ```ts
 * import { useNet, webSocketConnection } from 'nacatamalon/net';
 *
 * const net = useNet();
 * net.connect(webSocketConnection(new WebSocket('wss://example.com', 'nacatamalon')), { room: 'lobby' });
 * ```
 *
 * @param socket The WebSocket, open or on its way.
 * @returns The connection, to give `useNet().connect` or a server's `accept`.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const webSocketConnection = (socket: TSocketLike): TNetConnection => {
    let waiting: string[] = [];
    let closed = false;
    let onClose: ((reason?: string) => void) | null = null;
    const end = (reason?: string): void => {
        if (closed) return;
        closed = true;
        waiting = [];
        onClose?.(reason);
    };
    socket.addEventListener('open', () => {
        for (const text of waiting) socket.send(text);
        waiting = [];
    });
    socket.addEventListener('close', (event) => end(event.reason || undefined));
    // An error is followed by a close, which is what says the line is gone.
    socket.addEventListener('error', () => {});

    return {
        send: (text) => {
            if (closed) return;
            if (socket.readyState === OPEN) socket.send(text);
            else if (socket.readyState === CONNECTING) waiting.push(text);
        },
        onMessage: (listener) => {
            socket.addEventListener('message', (event) => {
                const text = textOf(event.data);
                if (text !== null) listener(text);
            });
        },
        onClose: (listener) => {
            onClose = listener;
        },
        close: (reason) => {
            // Normal closure.
            socket.close(1000, shortReason(reason));
            end(reason);
        },
    };
};
