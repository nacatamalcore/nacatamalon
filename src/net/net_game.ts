import { reportFrameError } from '../game/loop/report_frame_error';
import { netHost } from './net_host';
import { setNetInbox } from './net_inbox';
import {
    clientGone, clientOffline, clientPong, clientSnap, clientSpawn, clientStep, emptyShare, remoteActions,
    rewindFor, serverFinish, serverStep,
} from './net_share';
import { decodeServerWire, encodeWire, WIRE_VERSION } from './protocol';
import { webSocketConnection } from './web_socket_connection';
import type { TBox } from '../box';
import type { TActionsHandle } from '../input';
import type { TRuntimeStore } from '../store';
import type { TShareSide, TShareState } from './net_share';
import type { TServerWire, TSnapEntry } from './protocol';
import type { TNetConnection } from './types/t_net_connection';
import type { TNetConnectOptions, TNetHandle, TNetRole, TNetStatus } from './types/t_net_handle';

/**
 * Something that arrived and waits for the start of the next step. `line` is which connection of a
 * player's game it came over, so what a line said after the game moved on to another is not heard.
 */
type TNetEvent =
    | { kind: 'message'; type: string; data: unknown; from: string | null; line?: number }
    | { kind: 'join'; player: string; line?: number }
    | { kind: 'leave'; player: string; line?: number }
    | { kind: 'connect'; line: number; me: string; room: string; players: string[]; rate: number }
    | { kind: 'disconnect'; line: number; reason: string }
    | { kind: 'spawn'; line: number; wire: Extract<TServerWire, { k: 'spawn' }> }
    | { kind: 'gone'; line: number; id: string }
    | { kind: 'replay'; line: number; of: string }
    | { kind: 'snap'; line: number; t: number; ack: number; changes: TSnapEntry[] };

type TListener<F> = { box: TBox | null; fn: F };

/**
 * What a room of the server does for its scenes: reaching the players.
 *
 * @internal
 */
export type TNetServerSide = {
    /** Whether a player is still in the room: what one sent before being sent out is not heard. */
    has(player: string): boolean;
    /** The players in the room now. */
    players(): string[];
    /** A line of text as it is, to one player or to all of them. */
    post(text: string, to?: string): void;
    sendTo(player: string, type: string, data: unknown): void;
    broadcast(type: string, data: unknown, except: string | undefined): void;
    kick(player: string, reason: string): void;
};

/**
 * One game's place on the network: what its scenes see (`status`, `room`, `me`, `players`), changed
 * only as each step starts, what waits to be handed over, and who listens.
 *
 * @internal
 */
export type TNetGame = {
    role: TNetRole;
    status: TNetStatus;
    room: string | null;
    me: string | null;
    players: string[];
    inbox: TNetEvent[];
    messages: Map<string, Set<TListener<(data: unknown, from: string | null) => void>>>;
    joins: Set<TListener<(player: string) => void>>;
    leaves: Set<TListener<(player: string) => void>>;
    connects: Set<TListener<() => void>>;
    disconnects: Set<TListener<(reason: string) => void>>;
    /** A player's game: the line to the server, and which one it is (each connect makes a new one). */
    line: TNetConnection | null;
    lineCount: number;
    /** Whether the server has sent something that is not one of the engine's messages, said once. */
    toldStrange: boolean;
    /** A room of the server: how it reaches its players. */
    server: TNetServerSide | null;
    /** The objects shared with every game in the room. */
    share: TShareState;
    /** The same game, as the sharing sees it. */
    side: TShareSide;
    /** What a player's game asked of its line: how far behind the server it shows the others. */
    interpolation: number | null;
};

const games = new WeakMap<TRuntimeStore, TNetGame>();

const emptyGame = (role: TNetRole): TNetGame => {
    const game: TNetGame = {
        role,
        status: role === 'server' ? 'online' : 'offline',
        room: null,
        me: null,
        players: [],
        inbox: [],
        messages: new Map(),
        joins: new Set(),
        leaves: new Set(),
        connects: new Set(),
        disconnects: new Set(),
        line: null,
        lineCount: 0,
        toldStrange: false,
        server: null,
        share: emptyShare(),
        side: null as unknown as TShareSide,
        interpolation: null,
    };
    game.side = {
        role,
        get me() { return game.me; },
        get status() { return game.status; },
        share: game.share,
        players: () => game.server?.players() ?? [],
        post: (text, to) => game.server?.post(text, to),
        send: (text) => game.line?.send(text),
    };
    return game;
};

/**
 * Tells every listener in `set`, each on its own so one that throws costs only itself, and none
 * whose object was destroyed this frame.
 */
const tell = <A extends unknown[]>(store: TRuntimeStore, set: Set<TListener<(...args: A) => void>>, ...args: A): void => {
    for (const listener of [...set]) {
        if (!set.has(listener) || listener.box?.destroyed === true) continue;
        try {
            listener.fn(...args);
        } catch (error) {
            reportFrameError(store, error);
        }
    }
};

/**
 * Hands over what arrived, in order, changing what the scenes see as each thing is told.
 */
const deliver = (store: TRuntimeStore, game: TNetGame): void => {
    if (game.inbox.length === 0) return;
    // Taken first: what arrives while listeners run waits for the next step.
    const events = game.inbox;
    game.inbox = [];
    for (const event of events) {
        // Said over a line this game has since left for another: that room is not this one.
        if ((event.kind === 'message' || event.kind === 'join' || event.kind === 'leave' || event.kind === 'spawn' || event.kind === 'gone' || event.kind === 'snap' || event.kind === 'replay')
            && event.line !== undefined && event.line !== game.lineCount) {
            continue;
        }
        switch (event.kind) {
            case 'message': {
                // From a player sent out earlier in this same step: the rest of what they sent is not heard.
                if (event.from !== null && game.server !== null && !game.server.has(event.from)) break;
                const set = game.messages.get(event.type);
                if (set !== undefined) tell(store, set, event.data, event.from);
                break;
            }
            case 'join':
                if (!game.players.includes(event.player)) game.players.push(event.player);
                tell(store, game.joins, event.player);
                break;
            case 'leave':
                game.players = game.players.filter((player) => player !== event.player);
                tell(store, game.leaves, event.player);
                break;
            case 'connect':
                if (event.line !== game.lineCount) break;
                game.status = 'online';
                game.me = event.me;
                game.room = event.room;
                game.players = [...new Set(event.players)];
                game.share.sendRate = event.rate;
                // Fixed when the game says; else it starts safe and follows the line.
                game.share.adaptive = game.interpolation === null;
                game.share.interpolation = game.interpolation ?? Math.max(0.1, 2.5 / event.rate);
                tell(store, game.connects);
                // Everyone already there, this player among them, as if they had just come.
                for (const player of [...game.players]) {
                    tell(store, game.joins, player);
                }
                break;
            case 'disconnect': {
                // Whoever was in the room is gone from this game's point of view, and what the
                // server made goes with them.
                const gone = game.players;
                game.players = [];
                clientOffline(game.share);
                for (const player of gone) tell(store, game.leaves, player);
                // Unless the game already connected again, which has its own status by now.
                if (event.line === game.lineCount) {
                    game.status = 'closed';
                    game.me = null;
                    game.room = null;
                }
                tell(store, game.disconnects, event.reason);
                break;
            }
            case 'spawn':
                clientSpawn(store, game.side, event.wire);
                break;
            case 'gone':
                clientGone(game.share, event.id);
                break;
            case 'replay': {
                // What waited for a spawner of that name, as it is now: what went since is not in it.
                const waiting = game.share.orphans.get(event.of) ?? [];
                game.share.orphans.delete(event.of);
                for (const wire of waiting) clientSpawn(store, game.side, wire);
                break;
            }
            case 'snap':
                clientSnap(game.side, event.t, event.ack, event.changes);
                break;
        }
    }
};

/** The game's own map of actions, as it is now. */
const defsOf = (store: TRuntimeStore) => () => store.get('input').actions.defs;

/**
 * The network state of a game, made the first time anything asks: a player's game unless a room
 * made it first as the server's.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const netGameOf = (store: TRuntimeStore, role: TNetRole = 'client'): TNetGame => {
    let game = games.get(store);
    if (game !== undefined) return game;
    game = emptyGame(role);
    const made = game;
    games.set(store, made);
    const defs = defsOf(store);
    let local: TActionsHandle | null = null;
    const localActions = (): TActionsHandle => {
        local ??= store.get('input').actions.handle('any');
        return local;
    };
    setNetInbox(store, {
        deliver: () => deliver(store, made),
        step: (dt) => {
            if (made.role === 'server') serverStep(store, made.side, defs, dt);
            else clientStep(store, made.side, localActions, defs, dt);
        },
        finish: () => {
            if (made.role === 'server' && made.server !== null) serverFinish(store, made.side);
        },
    });
    if (role === 'client') {
        // The line goes with the game: a page that ends its game does not keep its seat in the room.
        store.subscribe('loop', (loop) => loop.destroyed, (destroyed) => {
            if (destroyed && made.line !== null) {
                const line = made.line;
                made.line = null;
                made.lineCount += 1;
                line.close('the game ended');
            }
        });
    }
    return made;
};

/**
 * Puts something that arrived in a game's inbox, for the start of its next step.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const queueNet = (game: TNetGame, event: TNetEvent): void => {
    game.inbox.push(event);
};

const ROLE_ONLY = {
    client: (who: string): Error => new Error(`[NacatamalOn] useNet().${who}: this scene runs in a room of the server, and only a player's game does that. The server reaches the players with sendTo(player, type, data) and broadcast(type, data); check useNet().role first in code both run.`),
    server: (who: string): Error => new Error(`[NacatamalOn] useNet().${who}: this scene runs in a player's game, and only the server does that. A player's game tells the server what it did with send(type, data), and the server decides; check useNet().role first in code both run.`),
};

/** A message type a listener or a send can be told by. */
const checkType = (who: string, type: unknown): void => {
    if (typeof type !== 'string' || type === '') {
        throw new Error(`[NacatamalOn] useNet().${who}: a message's type is a name, as in 'say' or 'walk', and got ${type === '' ? 'an empty string' : typeof type}.`);
    }
};

/** A player's name, as the server's calls take it. */
const checkPlayer = (who: string, player: unknown): void => {
    if (typeof player !== 'string' || player === '') {
        throw new Error(`[NacatamalOn] useNet().${who}: it takes a player's name, as in useNet().players, and got ${player === '' ? 'an empty string' : typeof player}.`);
    }
};

/**
 * Connects a player's game to its server over `line` and asks for a room.
 */
const connect = (game: TNetGame, to: string | TNetConnection, options: TNetConnectOptions): void => {
    const room = options.room ?? 'main';
    if (typeof room !== 'string' || room === '') {
        throw new Error(`[NacatamalOn] useNet().connect: the room is a name, as in 'lobby', and got ${room === '' ? 'an empty string' : typeof room}.`);
    }
    const interpolation = options.interpolation;
    if (interpolation !== undefined && (typeof interpolation !== 'number' || !Number.isFinite(interpolation) || interpolation < 0 || interpolation > 1)) {
        throw new Error(`[NacatamalOn] useNet().connect: interpolation is how far behind the server the others are shown, in seconds from 0 to 1, and got ${String(interpolation)}. 0.1 is a good start.`);
    }
    game.interpolation = interpolation ?? null;
    let line: TNetConnection;
    // A tool running the server and its players together (an editor) reaches the server itself.
    const hosted = typeof to === 'string' ? netHost()?.connect(to) ?? null : null;
    if (hosted !== null) {
        line = hosted;
    } else if (typeof to === 'string') {
        const Socket = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
        if (Socket === undefined) {
            throw new Error(`[NacatamalOn] useNet().connect: there is no WebSocket here to reach '${to}'. Give a connection of your own (a TNetConnection) instead.`);
        }
        line = webSocketConnection(new Socket(to));
    } else if (to !== null && typeof to === 'object' && typeof to.send === 'function' && typeof to.onMessage === 'function') {
        line = to;
    } else {
        throw new Error('[NacatamalOn] useNet().connect: it takes the server\'s address (\'wss://…\') or a connection (a TNetConnection, as connectLoopback gives).');
    }

    // Already on a line: it ends, and the players of that room leave this game as it starts again.
    if (game.line !== null) {
        const old = game.line;
        game.line = null;
        queueNet(game, { kind: 'disconnect', line: game.lineCount, reason: 'connected again' });
        old.close('connected again');
    }
    game.lineCount += 1;
    const count = game.lineCount;
    game.line = line;
    game.status = 'connecting';
    const current = () => game.line === line && game.lineCount === count;
    // The server says why before it ends a line itself, and that is the reason the game hears.
    let reason: string | null = null;
    const ended = (why: string): void => {
        if (!current()) return;
        game.line = null;
        queueNet(game, { kind: 'disconnect', line: count, reason: reason ?? why });
    };

    line.onMessage((text) => {
        if (!current()) return;
        const wire = decodeServerWire(String(text));
        if (wire === null) {
            if (!game.toldStrange) {
                game.toldStrange = true;
                console.warn(`[NacatamalOn] useNet: the server sent something that is not one of the engine's messages, and it was left out (said once): ${String(text).slice(0, 80)}. Is the address the game's own server?`);
            }
            return;
        }
        switch (wire.k) {
            case 'welcome':
                queueNet(game, { kind: 'connect', line: count, me: wire.id, room: wire.room, players: wire.players, rate: wire.r });
                break;
            case 'join':
                queueNet(game, { kind: 'join', player: wire.id, line: count });
                break;
            case 'leave':
                queueNet(game, { kind: 'leave', player: wire.id, line: count });
                break;
            case 'msg':
                queueNet(game, { kind: 'message', type: wire.t, data: wire.d, from: null, line: count });
                break;
            case 'bye':
                reason = wire.reason;
                ended(wire.reason);
                line.close(wire.reason);
                break;
            case 'spawn':
                queueNet(game, { kind: 'spawn', line: count, wire });
                break;
            case 'gone':
                queueNet(game, { kind: 'gone', line: count, id: wire.id });
                break;
            case 'snap':
                queueNet(game, { kind: 'snap', line: count, t: wire.t, ack: wire.a, changes: wire.b });
                break;
            case 'pong':
                // Measured as it arrives, not at the next step: the wait for the step is not the line's.
                clientPong(game.share, wire.n);
                break;
        }
    });
    line.onClose((why) => ended(why ?? 'the line was closed'));
    line.send(encodeWire('useNet().connect', { k: 'hello', v: WIRE_VERSION, room, token: options.token ?? null }));
};

/**
 * The handle a scene's `useNet()` gives, its listeners going with `box`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createNetHandle = (store: TRuntimeStore, game: TNetGame, box: TBox | null): TNetHandle => {
    const listen = <F>(set: Set<TListener<F>>, fn: F, who: string): (() => void) => {
        if (typeof fn !== 'function') {
            throw new Error(`[NacatamalOn] useNet().${who}: it takes a function to call, and got ${typeof fn}.`);
        }
        const listener: TListener<F> = { box, fn };
        set.add(listener);
        const off = () => {
            set.delete(listener);
        };
        box?.cleanups.push(off);
        return off;
    };
    const client = (who: string): void => {
        if (game.role !== 'client') throw ROLE_ONLY.client(who);
    };
    const server = (who: string): TNetServerSide => {
        if (game.role !== 'server' || game.server === null) throw ROLE_ONLY.server(who);
        return game.server;
    };

    return {
        get role() { return game.role; },
        get status() { return game.status; },
        get room() { return game.room; },
        get me() { return game.me; },
        get players() { return game.players; },
        get ping() { return game.role === 'client' ? game.share.ping : null; },

        onMessage: <T>(type: string, listener: (data: T, from: string | null) => void) => {
            checkType('onMessage', type);
            let set = game.messages.get(type);
            if (set === undefined) {
                set = new Set();
                game.messages.set(type, set);
            }
            return listen(set, listener as (data: unknown, from: string | null) => void, 'onMessage');
        },
        onJoin: (listener) => listen(game.joins, listener, 'onJoin'),
        onLeave: (listener) => listen(game.leaves, listener, 'onLeave'),
        onConnect: (listener) => listen(game.connects, listener, 'onConnect'),
        onDisconnect: (listener) => listen(game.disconnects, listener, 'onDisconnect'),

        connect: (to, options = {}) => {
            client('connect');
            connect(game, to, options);
        },
        disconnect: () => {
            client('disconnect');
            if (game.line === null) return;
            const line = game.line;
            game.line = null;
            queueNet(game, { kind: 'disconnect', line: game.lineCount, reason: 'left' });
            line.close('left');
        },
        send: (type, data) => {
            client('send');
            checkType('send', type);
            if (game.line === null) {
                if (game.lineCount === 0) {
                    throw new Error(`[NacatamalOn] useNet().send: '${type}' was sent with no server to send it to. Call connect first, and send once onConnect has said the game is in its room.`);
                }
                // The line went a moment ago, and the scenes hear it at the start of the next step:
                // what is sent in between is lost, as it would be on a line that dropped.
                return;
            }
            game.line.send(encodeWire('useNet().send', { k: 'msg', t: type, d: data }));
        },

        sendTo: (player, type, data) => {
            checkType('sendTo', type);
            server('sendTo').sendTo(player, type, data);
        },
        broadcast: (type, data, options) => {
            checkType('broadcast', type);
            server('broadcast').broadcast(type, data, options?.except);
        },
        kick: (player, reason) => {
            server('kick').kick(player, reason ?? 'sent out of the room');
        },
        actions: (player) => {
            server('actions');
            checkPlayer('actions', player);
            return remoteActions(game.share, defsOf(store), player);
        },
        rewind: (player, fn) => {
            server('rewind');
            checkPlayer('rewind', player);
            if (typeof fn !== 'function') {
                throw new Error(`[NacatamalOn] useNet().rewind: it takes the player and a function to run with everything where they saw it, and got ${typeof fn}.`);
            }
            return rewindFor(game.side, player, fn);
        },
    };
};
