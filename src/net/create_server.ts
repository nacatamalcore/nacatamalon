import { createRoom, roomInternal } from './create_room';
import { decodeClientWire, encodeWire, WIRE_VERSION } from './protocol';
import { netHost } from './net_host';
import { listenWithNode } from './node_listen';
import { webSocketConnection } from './web_socket_connection';
import type { TClientWire } from './protocol';
import type { TNetConnection } from './types/t_net_connection';
import type { TRoom } from './types/t_room';
import type { TNetAdmitRequest, TServer, TServerOptions } from './types/t_server';

/**
 * The line of a player as one room has it: the room sends on it while it is the player's room, and
 * whether the room ended it (a kick, the same player from another tab).
 */
type TRoomLine = { connection: TNetConnection; closedByRoom: boolean };

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

    /**
     * The scene a room runs, `undefined` when every room runs the first, or `null` when there is no
     * such room (said when `roomScene` named a scene the game does not have).
     */
    const sceneOf = (name: string): string | undefined | null => {
        const scene = roomScene === undefined ? undefined : roomScene(name);
        if (scene === null || (scene !== undefined && !sceneNames.includes(scene))) {
            if (typeof scene === 'string') {
                console.warn(`[NacatamalOn] createServer: roomScene gave '${scene}' for room '${name}', and there is no scene of that name. The player was refused; give one of ${sceneNames.map((n) => `'${n}'`).join(', ')}, or null to refuse.`);
            }
            return null;
        }
        return scene;
    };

    /**
     * Asks `admit`, for at most `ADMIT_WAIT` seconds: `null` when it took longer, `false` when it
     * threw (said).
     */
    const decide = (request: TNetAdmitRequest): Promise<boolean | string | null> => {
        if (admit === undefined) return Promise.resolve(true);
        return new Promise((done) => {
            const late = setTimeout(() => done(null), ADMIT_WAIT * 1000);
            Promise.resolve()
                .then(() => admit(request))
                .then((verdict) => done(verdict), (error) => {
                    console.error(`[NacatamalOn] createServer: admit threw for a player asking for room '${request.room}', who was refused.`, error);
                    done(false);
                })
                .finally(() => clearTimeout(late));
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
        /** The name the room gave the player, and what their game proved who they are with. */
        let player: string | null = null;
        let token: string | null = null;
        /** The line as the room it is in has it: each room gets one of its own. */
        let wrapper: TRoomLine | null = null;
        let lineClosed = false;
        /** A move being decided (`admit`), and the move whose `here` is waited for. */
        let moving = false;
        let arriving: number | null = null;
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

        /**
         * The line for one room: what it sends goes out while it is the player's room, and what it
         * listens with is heard until the player moves on.
         */
        const wrap = (): TRoomLine => {
            const own: TRoomLine = {
                closedByRoom: false,
                connection: {
                    send: (out) => {
                        if (wrapper === own) line.send(out);
                    },
                    onMessage: (listener) => {
                        if (wrapper === own) hear = listener;
                    },
                    onClose: (listener) => {
                        if (wrapper === own) hearClose = listener;
                    },
                    close: (reason) => {
                        if (wrapper !== own) return;
                        own.closedByRoom = true;
                        line.close(reason);
                    },
                },
            };
            return own;
        };

        line.onClose((reason) => {
            lineClosed = true;
            clearTimeout(timer);
            waiting.delete(line);
            hearClose?.(reason);
            if (room !== null) emptied(room);
        });

        /**
         * What a player in a room said: a move is the server's, the rest is the room's, unless the
         * player was just moved and does not know yet.
         */
        const heard = (text: string): void => {
            const said = String(text);
            const ours = said.startsWith('{"k":"go"') || said.startsWith('{"k":"here"');
            const wire = ours ? decodeClientWire(said) : null;
            if (wire?.k === 'go') {
                void move(wire).catch((error: unknown) => {
                    // Nothing in a move should throw this far: said, and answered, so the player's
                    // promise does not wait for ever.
                    console.error(`[NacatamalOn] createServer: a move to room '${wire.room}' failed, and the player stayed where they were.`, error);
                    stay(wire.n, `room '${wire.room}' could not take the player`);
                });
                return;
            }
            if (arriving !== null) {
                // Moved, and the player's game does not know yet: what it says was for the room it
                // left. Only its ping is answered, and its `here` ends the wait.
                if (wire?.k === 'here') {
                    if (wire.n === arriving) arriving = null;
                    return;
                }
                if (!said.startsWith('{"k":"ping"')) return;
            } else if (wire?.k === 'here') {
                return;
            }
            hear?.(said);
        };

        const stay = (n: number, reason: string): void => {
            if (!lineClosed) line.send(encodeWire('createServer', { k: 'stay', n, reason }));
        };

        /**
         * A player asking to move to another room: let go of by the one it is in only once the other
         * would take it, so a player turned away is where it was.
         */
        const move = async (wire: Extract<TClientWire, { k: 'go' }>): Promise<void> => {
            if (moving || arriving !== null) {
                stay(wire.n, 'already moving');
                return;
            }
            const from = room;
            const fromRoom = from === null ? undefined : rooms.get(from);
            const was = wrapper;
            // Not in a room any more (its room ended and the line with it, a moment ago): the
            // player still hears an answer.
            if (from === null || fromRoom === undefined || was === null || player === null) {
                stay(wire.n, 'not in a room');
                return;
            }
            if (wire.room === from) {
                stay(wire.n, `already in room '${from}'`);
                return;
            }
            moving = true;
            try {
                let scene: string | undefined | null;
                try {
                    scene = sceneOf(wire.room);
                } catch (error) {
                    console.error(`[NacatamalOn] createServer: roomScene threw for room '${wire.room}', asked for by a player in '${from}', who stayed where they were.`, error);
                    stay(wire.n, `room '${wire.room}' could not start`);
                    return;
                }
                if (scene === null) {
                    stay(wire.n, `there is no room '${wire.room}'`);
                    return;
                }
                const asking = wire.token === undefined ? token : wire.token;
                // Meanwhile the player is still in its room, and what it says reaches it.
                const verdict = await decide({ room: wire.room, token: asking, from: { room: from, player } });
                // Gone, sent out by its room, or on another line while `admit` was deciding.
                if (lineClosed || closed || wrapper !== was || was.closedByRoom || rooms.get(from) !== fromRoom) {
                    stay(wire.n, 'the room it was in let it go meanwhile');
                    return;
                }
                if (verdict === null) {
                    stay(wire.n, 'it was not let in in time');
                    return;
                }
                if (verdict === false || verdict === '') {
                    stay(wire.n, 'not let in');
                    return;
                }
                let to: TRoom;
                try {
                    to = roomFor(wire.room, scene);
                } catch (error) {
                    console.error(`[NacatamalOn] createServer: room '${wire.room}' could not take a player moving from '${from}', who stayed where they were.`, error);
                    stay(wire.n, `room '${wire.room}' could not start`);
                    return;
                }
                let released: boolean;
                try {
                    released = roomInternal(fromRoom).release(player, was.connection);
                } catch (error) {
                    // Half let go of, perhaps: nothing to stay in. The line ends, and each room is
                    // left as its players leave it.
                    console.error(`[NacatamalOn] createServer: room '${from}' threw letting go of a player moving to '${wire.room}', whose line was ended.`, error);
                    refuse(line, `room '${from}' could not let the player go`);
                    emptied(from);
                    emptied(wire.room);
                    return;
                }
                if (!released) {
                    stay(wire.n, 'the room it was in let it go meanwhile');
                    // Made for this move, it is not left running with nobody in it.
                    emptied(wire.room);
                    return;
                }
                // Let go of: from here there is no staying where it was, and what goes wrong ends
                // the line.
                try {
                    emptied(from);
                    room = wire.room;
                    hear = null;
                    hearClose = null;
                    wrapper = wrap();
                    // Before its welcome goes, so nothing said after it slips through.
                    arriving = wire.n;
                    player = roomInternal(to).join(wrapper.connection, typeof verdict === 'string' ? verdict : undefined, wire.n);
                    if (wire.token !== undefined) token = wire.token;
                } catch (error) {
                    console.error(`[NacatamalOn] createServer: room '${wire.room}' could not take a player moving from '${from}', whose line was ended.`, error);
                    refuse(line, `room '${wire.room}' could not take the player`);
                    emptied(wire.room);
                }
            } finally {
                moving = false;
            }
        };

        line.onMessage(async (text) => {
            if (hear !== null || room !== null) {
                heard(text);
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
            // Another version of the messages would be read in part: the player hears why it is not let in.
            if (wire.v !== WIRE_VERSION) {
                clearTimeout(timer);
                waiting.delete(line);
                refuse(line, `the game speaks version ${wire.v} of the game's messages and its server version ${WIRE_VERSION}; run the same build of the engine on both`);
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

        /**
         * Asks which scene the room runs and whether the player gets in, and lets them in.
         */
        const letIn = async (name: string, given: string | null): Promise<void> => {
            const scene = sceneOf(name);
            if (scene === null) {
                waiting.delete(line);
                refuse(line, `there is no room '${name}'`);
                return;
            }
            let verdict: boolean | string = true;
            if (admit !== undefined) {
                try {
                    verdict = await admit({ room: name, token: given });
                } catch (error) {
                    console.error(`[NacatamalOn] createServer: admit threw for a player asking for room '${name}', who was refused.`, error);
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
            const into = roomFor(name, scene);
            room = name;
            token = given;
            wrapper = wrap();
            player = roomInternal(into).join(wrapper.connection, typeof verdict === 'string' ? verdict : undefined, undefined);
            // Through the server's ear too: a move asked for before being let in is a move.
            for (const text of early.splice(0)) heard(text);
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
