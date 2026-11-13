import { createRoom } from './create_room';
import { decodeClientWire, encodeWire, WIRE_VERSION } from './protocol';
import { netHost } from './net_host';
import { listenWithNode } from './node_listen';
import { webSocketConnection } from './web_socket_connection';
import type { TNetConnection } from './types/t_net_connection';
import type { TRoom } from './types/t_room';
import type { TServer, TServerOptions } from './types/t_server';

/** Seconds a player's game has to say which room it wants before its line is ended. */
const HELLO_WAIT = 10;

/**
 * How long, in seconds, `admit` may take to decide on a player: past it they are refused, and what
 * they sent meanwhile is let go. An account check that never answers must not hold a line for ever.
 */
const ADMIT_WAIT = 15;

/**
 * What a player's game may send while it waits to be let in, kept for the room: a few messages, a
 * little text. More is not a game waiting, and the line is refused.
 */
const MOST_EARLY_MESSAGES = 64;
const MOST_EARLY_BYTES = 64 * 1024;

/**
 * What Bun's server hands its WebSocket handlers: the socket, with room for our own data.
 */
type TBunSocket = {
    data: { line?: { message(text: string): void; close(reason?: string): void } };
    send(text: string): void;
    close(code?: number, reason?: string): void;
};

type TBun = {
    serve(options: {
        port: number;
        fetch(request: Request, server: { upgrade(request: Request, options?: { data: object }): boolean }): Response | undefined;
        websocket: {
            open(socket: TBunSocket): void;
            message(socket: TBunSocket, message: string | Uint8Array): void;
            close(socket: TBunSocket, code: number, reason: string): void;
        };
    }): { stop(closeActive?: boolean): void };
};

/**
 * Makes a server: it takes players' connections, asks `admit` who gets in, and gives each room asked
 * for a game of its own (`createRoom`) running the game's scenes, which ends when its last player
 * leaves. What the rooms decide is the truth every player's game is told.
 *
 * Connections come from `listen(port)`, in Bun or Node, from `connectLoopback`, in the same page or process,
 * or from any server of someone else's through `accept`. The players' games connect with
 * `useNet().connect`.
 *
 * Accounts are the game's: the engine carries the token a player's game sends and asks `admit`,
 * which checks it however the game keeps its players.
 *
 * @example
 * ```ts
 * // server.ts, run with `bun server.ts` (or Node: `node server.js`)
 * import { createScene, type TSceneFn } from 'nacatamalon';
 * import { createServer } from 'nacatamalon/net';
 *
 * // The game's own scenes, as its players' pages run them.
 * const Lobby: TSceneFn = () => createScene();
 * const Pool: TSceneFn = () => createScene();
 *
 * const server = createServer({
 *     width: 320, height: 180,
 *     scenes: { Lobby, Pool },
 *     step: 20,
 *     roomScene: (room) => (room === 'pool' ? 'Pool' : 'Lobby'),
 *     admit: async ({ token }) => (await accountOf(token))?.name ?? false,
 * });
 * server.listen(8080);
 *
 * declare function accountOf(token: string | null): Promise<{ name: string } | null>;
 * ```
 *
 * @param options The game's options and scenes, and who gets into which room.
 * @returns The server, taking connections at once.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createServer = (options: TServerOptions): TServer => {
    const { admit, roomScene, ...roomOptions } = options;
    if (admit !== undefined && typeof admit !== 'function') {
        throw new Error('[NacatamalOn] createServer: admit is a function that decides who gets in, and got ' + typeof admit + '.');
    }
    if (roomScene !== undefined && typeof roomScene !== 'function') {
        throw new Error('[NacatamalOn] createServer: roomScene is a function from a room\'s name to the scene it runs, and got ' + typeof roomScene + '.');
    }
    const sceneNames = Object.keys(options.scenes ?? {});
    const rooms = new Map<string, TRoom>();
    let closed = false;
    let listening: { stop(closeActive?: boolean): void } | null = null;
    const waiting = new Set<TNetConnection>();

    const refuse = (line: TNetConnection, reason: string): void => {
        line.send(encodeWire('createServer', { k: 'bye', reason }));
        line.close(reason);
    };

    /** The room of that name, made the first time a player is let into it. */
    const roomFor = (name: string, scene: string | undefined): TRoom => {
        let room = rooms.get(name);
        if (room === undefined) {
            room = createRoom({ ...roomOptions, name, ...(scene === undefined ? {} : { initialScene: scene }) });
            rooms.set(name, room);
        }
        return room;
    };

    /**
     * Ends a room once nobody is left in it. Looked at once what is running now has finished: the
     * last player may have been sent out by the room's own scene, in the middle of its step, and a
     * room torn down under its own frame would go on running it on boxes already gone.
     */
    const emptied = (name: string): void => {
        queueMicrotask(() => {
            const room = rooms.get(name);
            if (room !== undefined && room.players.length === 0) {
                rooms.delete(name);
                room.destroy();
            }
        });
    };

    const accept = (line: TNetConnection): void => {
        if (closed) {
            refuse(line, 'the server is closed');
            return;
        }
        if (line === null || typeof line !== 'object' || typeof line.send !== 'function' || typeof line.onMessage !== 'function' || typeof line.onClose !== 'function') {
            throw new Error('[NacatamalOn] createServer: accept takes a player\'s connection, a TNetConnection with send, onMessage, onClose and close.');
        }
        waiting.add(line);
        // What the room listens to, once the player is in: everything after the hello goes there.
        let hear: ((text: string) => void) | null = null;
        let hearClose: ((reason?: string) => void) | null = null;
        let room: string | null = null;
        let asked = false;
        // What the player's game sent while `admit` was deciding: the room hears it once they are in.
        const early: string[] = [];
        let earlyBytes = 0;
        let timer = setTimeout(() => {
            if (waiting.has(line)) {
                waiting.delete(line);
                refuse(line, 'it did not say which room it wants');
            }
        }, HELLO_WAIT * 1000);

        line.onClose((reason) => {
            clearTimeout(timer);
            waiting.delete(line);
            hearClose?.(reason);
            if (room !== null) emptied(room);
        });
        line.onMessage(async (text) => {
            if (hear !== null) {
                hear(text);
                return;
            }
            if (asked) {
                if (!waiting.has(line)) return;
                const said = String(text);
                earlyBytes += said.length;
                if (early.length >= MOST_EARLY_MESSAGES || earlyBytes > MOST_EARLY_BYTES) {
                    clearTimeout(timer);
                    early.length = 0;
                    waiting.delete(line);
                    refuse(line, 'it sent too much before being let in');
                    return;
                }
                early.push(said);
                return;
            }
            const wire = decodeClientWire(String(text));
            if (wire === null || wire.k !== 'hello') {
                waiting.delete(line);
                refuse(line, 'it spoke before saying which room it wants');
                return;
            }
            asked = true;
            clearTimeout(timer);
            // Said which room it wants: now `admit` has its own while to decide in.
            timer = setTimeout(() => {
                if (waiting.has(line)) {
                    waiting.delete(line);
                    early.length = 0;
                    refuse(line, 'it was not let in in time');
                }
            }, ADMIT_WAIT * 1000);
            if (wire.v > WIRE_VERSION) {
                clearTimeout(timer);
                waiting.delete(line);
                refuse(line, 'the game is newer than its server');
                return;
            }
            try {
                await letIn(wire.room, wire.token);
            } catch (error) {
                // A room that could not start (its scene threw), or a `roomScene` that threw: the
                // player hears so, and the server goes on.
                console.error(`[NacatamalOn] createServer: room '${wire.room}' could not take a player, who was refused.`, error);
                waiting.delete(line);
                refuse(line, `room '${wire.room}' could not start`);
            }
        });

        /** Asks which scene the room runs and whether the player gets in, and lets them in. */
        const letIn = async (name: string, token: string | null): Promise<void> => {
            const wire = { room: name, token };
            const scene = roomScene === undefined ? undefined : roomScene(wire.room);
            if (scene === null || (scene !== undefined && !sceneNames.includes(scene))) {
                if (typeof scene === 'string') {
                    console.warn(`[NacatamalOn] createServer: roomScene gave '${scene}' for room '${wire.room}', and there is no scene of that name. The player was refused; give one of ${sceneNames.map((n) => `'${n}'`).join(', ')}, or null to refuse.`);
                }
                waiting.delete(line);
                refuse(line, `there is no room '${wire.room}'`);
                return;
            }
            let verdict: boolean | string = true;
            if (admit !== undefined) {
                try {
                    verdict = await admit({ room: wire.room, token: wire.token });
                } catch (error) {
                    console.error(`[NacatamalOn] createServer: admit threw for a player asking for room '${wire.room}', who was refused.`, error);
                    verdict = false;
                }
            }
            // Gone while being looked at, refused for taking too long, or the server closed meanwhile.
            if (!waiting.has(line)) return;
            clearTimeout(timer);
            waiting.delete(line);
            if (closed) {
                refuse(line, 'the server is closed');
                return;
            }
            if (verdict === false || (typeof verdict === 'string' && verdict === '')) {
                refuse(line, 'not let in');
                return;
            }
            room = wire.room;
            roomFor(wire.room, scene).join({
                send: (out) => line.send(out),
                onMessage: (listener) => { hear = listener; },
                onClose: (listener) => { hearClose = listener; },
                close: (reason) => line.close(reason),
            }, typeof verdict === 'string' ? verdict : undefined);
            for (const text of early.splice(0)) (hear as ((text: string) => void) | null)?.(text);
        };
    };

    return {
        accept,
        listen: (port) => {
            if (!Number.isInteger(port) || port < 0 || port > 65535) {
                throw new Error(`[NacatamalOn] createServer: listen takes a port, a whole number up to 65535, and got ${String(port)}.`);
            }
            if (listening !== null) {
                throw new Error('[NacatamalOn] createServer: it is already listening. One port per server.');
            }
            // A tool running the server and its players together (an editor) takes the lines itself.
            const host = netHost();
            if (host !== null) {
                const stop = host.listen(port, accept);
                listening = { stop: () => stop() };
                return;
            }
            const bun = (globalThis as { Bun?: TBun }).Bun;
            if (bun === undefined) {
                // Node, with its own HTTP server and a WebSocket of the engine's on top.
                const node = listenWithNode(port, accept);
                if (node === null) {
                    throw new Error('[NacatamalOn] createServer: listen opens a port with Bun or Node, and this is neither (a page cannot open one). Run the server with `bun` or `node`, or give accept the connections a WebSocket server of your own hands over (webSocketConnection wraps each one).');
                }
                listening = node;
                return;
            }
            listening = bun.serve({
                port,
                fetch: (request, server) => (server.upgrade(request, { data: {} })
                    ? undefined
                    : new Response('A nacatamalon server: connect with a WebSocket.', { status: 426 })),
                websocket: {
                    open: (socket) => {
                        const events = new EventTarget();
                        // Bun's socket hands its messages to the server, not to the socket: they are
                        // passed on to the connection as a browser's socket would get them.
                        socket.data.line = {
                            message: (text) => events.dispatchEvent(Object.assign(new Event('message'), { data: text })),
                            close: (reason) => events.dispatchEvent(Object.assign(new Event('close'), { reason: reason ?? '' })),
                        };
                        accept(webSocketConnection({
                            readyState: 1,
                            send: (text) => socket.send(text),
                            close: (code, reason) => socket.close(code, reason),
                            addEventListener: (type, listener) => events.addEventListener(type, listener as unknown as EventListener),
                        }));
                    },
                    message: (socket, message) => {
                        socket.data.line?.message(typeof message === 'string' ? message : new TextDecoder().decode(message));
                    },
                    close: (socket, _code, reason) => {
                        socket.data.line?.close(reason);
                    },
                },
            });
        },
        get rooms() { return [...rooms.keys()]; },
        room: (name) => rooms.get(name),
        close: () => {
            if (closed) return;
            closed = true;
            for (const line of [...waiting]) refuse(line, 'the server is closed');
            waiting.clear();
            for (const [name, room] of [...rooms]) {
                rooms.delete(name);
                room.destroy();
            }
            listening?.stop(true);
            listening = null;
        },
    };
};
