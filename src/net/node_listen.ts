import { webSocketConnection } from './web_socket_connection';
import type { TNetConnection } from './types/t_net_connection';

/**
 * A server's port in Node, with what Node already has: its HTTP server and its hashes, asked of the
 * runtime when the port is opened rather than imported, so the door stays free of Node for a page.
 * Node has a WebSocket to connect with but none to listen with, so the little of one a server needs
 * is here: the handshake, and frames of text in and out (RFC 6455).
 */

/** The part of Node's sockets this needs. */
type TNodeSocket = {
    write(data: Uint8Array | string): boolean;
    end(): void;
    destroy(): void;
    on(event: 'data', listener: (chunk: Uint8Array) => void): void;
    on(event: 'close' | 'end', listener: () => void): void;
    on(event: 'error', listener: (error: Error) => void): void;
    setNoDelay?(noDelay?: boolean): void;
};

type TNodeServer = {
    on(event: 'upgrade', listener: (request: { headers: Record<string, string | string[] | undefined> }, socket: TNodeSocket, head: Uint8Array) => void): void;
    on(event: 'error', listener: (error: Error) => void): void;
    listen(port: number): void;
    close(): void;
};

type TNodeHttp = {
    createServer(listener: (request: unknown, response: { writeHead(status: number, headers?: object): void; end(text?: string): void }) => void): TNodeServer;
};

type TNodeCrypto = {
    createHash(algorithm: string): { update(text: string): { digest(encoding: 'base64'): string } };
};

/** What every WebSocket handshake adds to the key, by the standard. */
const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** The most one message may weigh: past it, a player's line is closed rather than read. */
const LARGEST_MESSAGE = 1024 * 1024;

const TEXT = 0x1;
const CONTINUATION = 0x0;
const CLOSE = 0x8;
const PING = 0x9;
const PONG = 0xa;

/** A frame from the server: never masked, all in one. */
const frame = (opcode: number, payload: Uint8Array): Uint8Array => {
    const length = payload.length;
    const head = length < 126 ? 2 : length < 65536 ? 4 : 10;
    const out = new Uint8Array(head + length);
    out[0] = 0x80 | opcode;
    if (length < 126) {
        out[1] = length;
    } else if (length < 65536) {
        out[1] = 126;
        out[2] = length >> 8;
        out[3] = length & 0xff;
    } else {
        out[1] = 127;
        new DataView(out.buffer).setBigUint64(2, BigInt(length));
    }
    out.set(payload, head);
    return out;
};

/** A close frame's words: its code, then its reason. */
const closePayload = (code: number, reason: string): Uint8Array => {
    const words = new TextEncoder().encode(reason).slice(0, 123);
    const out = new Uint8Array(2 + words.length);
    out[0] = code >> 8;
    out[1] = code & 0xff;
    out.set(words, 2);
    return out;
};

/**
 * One player's socket as a browser's WebSocket looks, for `webSocketConnection`: it reads the frames
 * as they come, joins the pieces of a message, answers pings, and closes once.
 */
const socketOf = (socket: TNodeSocket) => {
    const events = new EventTarget();
    let state = 1;
    let buffer = new Uint8Array(0);
    let pieces: Uint8Array[] = [];
    let piecesSize = 0;
    const decoder = new TextDecoder();

    const shut = (reason: string): void => {
        if (state === 3) return;
        state = 3;
        events.dispatchEvent(Object.assign(new Event('close'), { reason }));
    };
    const fail = (code: number, reason: string): void => {
        if (state === 1) socket.write(frame(CLOSE, closePayload(code, reason)));
        socket.end();
        shut(reason);
    };

    /** Every whole frame in what came so far, the rest kept for the next chunk. */
    const read = (): void => {
        while (state === 1 && buffer.length >= 2) {
            const fin = (buffer[0] & 0x80) !== 0;
            const opcode = buffer[0] & 0x0f;
            const masked = (buffer[1] & 0x80) !== 0;
            let length = buffer[1] & 0x7f;
            let at = 2;
            if (length === 126) {
                if (buffer.length < 4) return;
                length = (buffer[2] << 8) | buffer[3];
                at = 4;
            } else if (length === 127) {
                if (buffer.length < 10) return;
                const big = new DataView(buffer.buffer, buffer.byteOffset + 2, 8).getBigUint64(0);
                if (big > BigInt(LARGEST_MESSAGE)) {
                    fail(1009, 'message too big');
                    return;
                }
                length = Number(big);
                at = 10;
            }
            // A player's game always masks what it sends; one that does not is not a browser's.
            if (!masked) {
                fail(1002, 'frames from a player are masked');
                return;
            }
            if (length > LARGEST_MESSAGE) {
                fail(1009, 'message too big');
                return;
            }
            if (buffer.length < at + 4 + length) return;
            const mask = buffer.subarray(at, at + 4);
            const payload = buffer.slice(at + 4, at + 4 + length);
            for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
            buffer = buffer.subarray(at + 4 + length);

            if (opcode === CLOSE) {
                socket.write(frame(CLOSE, payload.subarray(0, 2)));
                socket.end();
                shut(payload.length > 2 ? decoder.decode(payload.subarray(2)) : '');
                return;
            }
            if (opcode === PING) {
                socket.write(frame(PONG, payload));
                continue;
            }
            if (opcode === PONG) continue;
            if (opcode !== TEXT && opcode !== CONTINUATION) {
                // Binary: the engine's lines carry text only.
                fail(1003, 'text only');
                return;
            }
            piecesSize += payload.length;
            if (piecesSize > LARGEST_MESSAGE) {
                fail(1009, 'message too big');
                return;
            }
            pieces.push(payload);
            if (fin) {
                const whole = new Uint8Array(piecesSize);
                let offset = 0;
                for (const piece of pieces) {
                    whole.set(piece, offset);
                    offset += piece.length;
                }
                pieces = [];
                piecesSize = 0;
                events.dispatchEvent(Object.assign(new Event('message'), { data: decoder.decode(whole) }));
            }
        }
    };

    socket.on('data', (chunk) => {
        const next = new Uint8Array(buffer.length + chunk.length);
        next.set(buffer);
        next.set(chunk, buffer.length);
        buffer = next;
        read();
    });
    socket.on('close', () => shut('the line was closed'));
    socket.on('end', () => shut('the line was closed'));
    socket.on('error', () => shut('the line failed'));

    return {
        get readyState() { return state; },
        send: (text: string) => {
            if (state === 1) socket.write(frame(TEXT, new TextEncoder().encode(text)));
        },
        close: (code?: number, reason?: string) => {
            if (state !== 1) return;
            socket.write(frame(CLOSE, closePayload(code ?? 1000, reason ?? '')));
            state = 2;
            socket.end();
            shut(reason ?? '');
        },
        addEventListener: (type: 'open' | 'message' | 'close' | 'error', listener: (event: { data?: unknown; reason?: string }) => void) => {
            events.addEventListener(type, listener as unknown as EventListener);
        },
    };
};

/**
 * Opens `port` in Node and hands `accept` each player who connects with a WebSocket. `null` when
 * this is not Node (nor anything with its modules).
 *
 * @internal
 */
export const listenWithNode = (port: number, accept: (connection: TNetConnection) => void): { stop(): void } | null => {
    const runtime = (globalThis as { process?: { getBuiltinModule?: (name: string) => unknown } }).process;
    if (typeof runtime?.getBuiltinModule !== 'function') return null;
    const http = runtime.getBuiltinModule('node:http') as TNodeHttp | undefined;
    const crypto = runtime.getBuiltinModule('node:crypto') as TNodeCrypto | undefined;
    if (http === undefined || crypto === undefined) return null;

    const server = http.createServer((_request, response) => {
        response.writeHead(426, { 'content-type': 'text/plain' });
        response.end('A nacatamalon server: connect with a WebSocket.');
    });
    server.on('upgrade', (request, socket) => {
        const key = request.headers['sec-websocket-key'];
        const upgrade = String(request.headers.upgrade ?? '').toLowerCase();
        if (typeof key !== 'string' || upgrade !== 'websocket') {
            socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
            socket.destroy();
            return;
        }
        const answer = crypto.createHash('sha1').update(key + MAGIC).digest('base64');
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${answer}\r\n\r\n`,
        );
        socket.setNoDelay?.(true);
        accept(webSocketConnection(socketOf(socket)));
    });
    server.on('error', (error) => {
        console.error(`[NacatamalOn] createServer: port ${port} could not be listened on.`, error);
    });
    server.listen(port);
    return { stop: () => server.close() };
};
