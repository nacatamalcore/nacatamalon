import { rootOf } from '../box/root_of';
import { replaceScene } from '../hooks/scene/use_scene';
import { indexInPlaceOf, startedAs } from '../scene/start_scene';
import { isSceneStopped } from '../scene/stopped_scenes';
import { isBehindSplash } from '../splash/behind_splash';
import { canDrawTransition } from '../transition';
import { netHost } from './net_host';
import { pageOf } from '../DOM/window_of';
import { flushDestroyed } from '../destroy';
import { describeNetGame, reportNetError } from './report_net_error';
import { setNetInbox } from './net_inbox';
import {
    clientCatchUp, clientEndAside, clientForgetKept, clientGone, clientSetAsideScene, clientOffline, clientPong, clientSetAside, clientSettleKept, clientSnap, clientSpawn,
    clientStep, emptyShare, remoteActions, rewindFor, serverFinish, serverStep,
} from './net_share';
import { decodeServerWire, encodeWire, WIRE_VERSION } from './protocol';
import { applyRoomStores, awaitWholeRoomStores } from './room_store';
import { webSocketConnection } from './web_socket_connection';
import type { TBox } from '../box';
import type { TTransition, TTransitionState } from '../transition';
import type { TActionsHandle } from '../input';
import type { TRuntimeStore } from '../store';
import type { TShareSide, TShareState } from './net_share';
import type { TServerWire, TSnapEntry, TStoreEntry } from './protocol';
import type { TNetConnection } from './types/t_net_connection';
import type { TNetConnectOptions, TNetHandle, TNetJoinRoomOptions, TNetRole, TNetStatus } from './types/t_net_handle';

/**
 * Something that arrived and waits for the start of the next step. `line` is which connection of a
 * player's game it came over, so what a line said after the game moved on to another is not heard.
 */
type TNetEvent =
    | { kind: 'message'; type: string; data: unknown; from: string | null; line?: number; via?: object }
    | { kind: 'join'; player: string; line?: number }
    | { kind: 'leave'; player: string; line?: number }
    | { kind: 'connect'; line: number; me: string; room: string; players: string[]; rate: number; scene: string | null }
    | { kind: 'arrive'; line: number; me: string; room: string; players: string[]; rate: number; scene: string | null; n: number }
    | { kind: 'stay'; line: number; n: number; reason: string }
    | { kind: 'scene'; line: number; scene: string }
    | { kind: 'disconnect'; line: number; reason: string }
    | { kind: 'spawn'; line: number; wire: Extract<TServerWire, { k: 'spawn' }> }
    | { kind: 'gone'; line: number; id: string }
    | { kind: 'replay'; line: number; of: string }
    | { kind: 'snap'; line: number; t: number; ack: number; changes: TSnapEntry[]; whole: boolean }
    | { kind: 'stores'; line: number; full: boolean; entries: Record<string, TStoreEntry> };

type TListener<F> = { box: TBox | null; fn: F };

/**
 * A move to another room asked for (`joinRoom`), waiting for the server's answer.
 */
type TMove = {
    n: number;
    room: string;
    line: number;
    transition: TTransition | undefined;
    resolve: () => void;
    reject: (reason: Error) => void;
};

/**
 * A move the server made, and this game on its way to the scene it says: to another room
 * (`joinRoom`, `kind` `'room'`), or to the scene its room changed to (`'scene'`). `outgoing` is the
 * scene it leaves.
 */
type TTransfer = {
    kind: 'room' | 'scene';
    n: number;
    line: number;
    room: string;
    scene: string | null;
    players: string[];
    outgoing: TBox | null;
    transition: TTransition | undefined;
    move: TMove | null;
    /** The new room has arrived whole (its snapshot marked `w`), kept for its scene. */
    whole: boolean;
    started: boolean;
    failed: boolean;
    /** The cover the change went under, while it is on. */
    cover: TTransitionState | null;
    /** What threw building the scene again, in a covered restart. */
    restartError: { error: unknown } | null;
};

/**
 * What a room of the server does for its scenes: reaching the players.
 *
 * @internal
 */
export type TNetServerSide = {
    /** Whether a player is still in the room: what one sent before being sent out is not heard. */
    has(player: string): boolean;
    /**
     * Whether a player is still in the room over the connection `via`: what one sent before moving
     * on is not heard, though another came in under its name.
     */
    holds(player: string, via: object): boolean;
    /** The players in the room now. */
    players(): string[];
    /** A line of text as it is, to one player or to all of them. */
    post(text: string, to?: string): void;
    sendTo(player: string, type: string, data: unknown): void;
    broadcast(type: string, data: unknown, except: string | undefined): void;
    kick(player: string, reason: string): void;
    /** Once the step is over: what the room's stores changed and nobody was told yet, told. */
    endOfStep(): void;
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
    /** A player's game: the scene the room it is in runs, as its `welcome` said. */
    scene: string | null;
    /** A player's game: how many moves it has asked for, which numbers each. */
    moves: number;
    moving: TMove | null;
    transfer: TTransfer | null;
    /** A player's game: what arrived of the new room while its scene is on its way, kept for it. */
    held: TNetEvent[] | null;
    /** A player's game: how it follows the room's changes of scene (`connect`'s `sceneTransition`). */
    sceneTransition: TTransition | undefined;
    /** A player's game: the root of the room's scene here, once it has gone to one. */
    roomRoot: TBox | null;
    /**
     * A player's game, handing over the room after following its scene: that scene's root, whose
     * listeners hear an `onJoin` for everyone, while the others (a HUD) hear only who came and went.
     */
    arrivedRoot: TBox | null;
};

const games = new WeakMap<TRuntimeStore, TNetGame>();

/**
 * How often, in seconds, a player's game whose page is hidden hands over what arrived. A browser
 * may wait longer between them (a minute, after a while hidden), which is still far from piling up
 * everything until the page comes back.
 */
const HIDDEN_DELIVERY = 0.25;

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
        scene: null,
        moves: 0,
        moving: null,
        transfer: null,
        held: null,
        sceneTransition: undefined,
        roomRoot: null,
        arrivedRoot: null,
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
 * whose object was destroyed this frame. `what` is how an error names them.
 */
const tell = <A extends unknown[]>(store: TRuntimeStore, set: Set<TListener<(...args: A) => void>>, what: string, ...args: A): void => {
    tellWhere(store, set, what, null, ...args);
};

/**
 * As `tell`, to the listeners whose object `where` takes (`null`: all of them).
 */
const tellWhere = <A extends unknown[]>(
    store: TRuntimeStore,
    set: Set<TListener<(...args: A) => void>>,
    what: string,
    where: ((box: TBox | null) => boolean) | null,
    ...args: A
): void => {
    for (const listener of [...set]) {
        if (!set.has(listener) || listener.box?.destroyed === true) continue;
        if (where !== null && !where(listener.box)) continue;
        try {
            listener.fn(...args);
        } catch (error) {
            reportNetError(store, error, what);
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
    handOver(store, game, events);
};

/**
 * The scene running that was started as `name`, if one is.
 */
const runningScene = (store: TRuntimeStore, name: string | null): TBox | null => {
    if (name === null) return null;
    return store.get('world').scenes.find((root) => startedAs(root) === name && !isSceneStopped(root)) ?? null;
};

/**
 * While the room is handed to its new scene after following it: the listeners outside that scene
 * (`null` otherwise: all of them).
 */
const outsideArrived = (game: TNetGame): ((box: TBox | null) => boolean) | null => {
    const arrived = game.arrivedRoot;
    return arrived === null ? null : (box) => box === null || rootOf(box) !== arrived;
};

/**
 * The move going no further: the line it was on went, or the game connected again. What the scene
 * going out kept apart goes back if that scene still runs, what arrived for the new room goes, and
 * whoever asked hears why.
 */
const abortMove = (store: TRuntimeStore, game: TNetGame, line: number, reason: string): void => {
    const why = (room: string) => new Error(`[NacatamalOn] useNet().joinRoom: the line closed before the player was in room '${room}' (${reason}).`);
    if (game.moving !== null && game.moving.line === line) {
        const move = game.moving;
        game.moving = null;
        move.reject(why(move.room));
    }
    const transfer = game.transfer;
    if (transfer === null || transfer.line !== line) return;
    game.transfer = null;
    game.held = null;
    // A HUD's keys mix what comes next with what they have, as after any line that went.
    clientForgetKept(game.share);
    const outgoing = transfer.outgoing;
    clientEndAside(game.share, outgoing !== null && store.get('world').scenes.includes(outgoing) && !isSceneStopped(outgoing));
    transfer.move?.reject(why(transfer.room));
};

/**
 * The game ended with a move on its way: whoever waits for it hears why. Nothing else is put back,
 * as nothing of the game runs any more.
 */
const dropMove = (game: TNetGame, reason: string): void => {
    const error = (room: string) => new Error(`[NacatamalOn] useNet().joinRoom: the player did not get into room '${room}' (${reason}).`);
    const move = game.moving ?? game.transfer?.move ?? null;
    const room = game.moving?.room ?? game.transfer?.room ?? '';
    game.moving = null;
    game.transfer = null;
    game.held = null;
    move?.reject(error(room));
};

/**
 * The server moved this player to another room (`joinRoom`): before anything of that room's scene
 * is built, the room it left is over for this game. Who it is and where change, what that room
 * shared is taken out of the way, its players leave, and what comes next waits for the new scene.
 */
const arrive = (store: TRuntimeStore, game: TNetGame, event: Extract<TNetEvent, { kind: 'arrive' }>): void => {
    // The move asked for, or, with another number (which the server should never answer with),
    // followed all the same, as the server has moved it: the promise goes with it either way.
    const move = game.moving;
    game.moving = null;
    const previous = game.scene;
    game.me = event.me;
    game.room = event.room;
    game.scene = event.scene;
    game.share.sendRate = event.rate;
    game.share.adaptive = game.interpolation === null;
    game.share.interpolation = game.interpolation ?? Math.max(0.1, 2.5 / event.rate);
    // Not seeing the room until it is here whole: what it sends is let go, the stores not ready.
    game.status = 'connecting';
    awaitWholeRoomStores(store);
    const outgoing = runningScene(store, previous);
    clientSetAside(game.share, outgoing);
    game.transfer = {
        kind: 'room',
        n: event.n,
        line: event.line,
        room: event.room,
        scene: event.scene,
        players: event.players,
        outgoing,
        transition: move?.transition,
        move,
        whole: false,
        started: false,
        failed: false,
        cover: null,
        restartError: null,
    };
    game.held = [];
    // Once moving, so what their listeners send is let go (`send` drops it while a move is on).
    const gone = game.players;
    game.players = [];
    for (const player of gone) tell(store, game.leaves, 'an onLeave listener', player);
};

/**
 * The move going no further after the server made it: the scene of the new room did not start
 * here. The line ends as `disconnect()` ends it, saying why, rather than stay in a room of the
 * server with the scene of another.
 */
const failMove = (game: TNetGame, transfer: TTransfer, reason: string): void => {
    transfer.failed = true;
    const line = game.line;
    if (line === null) return;
    game.line = null;
    queueNet(game, { kind: 'disconnect', line: game.lineCount, reason });
    line.close(reason);
};

/**
 * The new room's scene runs: what the room sent waits no more. Its players, its objects, its stores
 * and its whole snapshot, which makes the game `'online'` there and tells `onConnect`.
 */
const completeMove = (store: TRuntimeStore, game: TNetGame, transfer: TTransfer, now: TBox): void => {
    game.transfer = null;
    game.roomRoot = now;
    clientEndAside(game.share, false);
    let held = game.held ?? [];
    game.held = null;
    // The room changed its scene again while this one was on its way: it gets what came before that
    // change, not as the whole room (it stays 'connecting', without onConnect), and the next follows.
    const next = held.findLastIndex((event) => event.kind === 'scene');
    if (next >= 0) held = held.filter((event, i) => i > next || !(event.kind === 'snap' && event.whole));
    if (transfer.kind === 'room') {
        game.players = [...new Set(transfer.players)];
        // The server lets through what this game says from now on.
        game.line?.send(encodeWire('useNet().joinRoom', { k: 'here', n: transfer.n }));
    } else {
        // The same room: who comes and goes meanwhile is heard by who already listened (a HUD),
        // and the new scene hears an onJoin for everyone with the whole room.
        game.arrivedRoot = now;
    }
    try {
        handOver(store, game, held);
    } finally {
        game.arrivedRoot = null;
    }
    transfer.move?.resolve();
};

/**
 * The room this player is in changed its scene: if this game is in the room's scene (or one it put
 * in its place), it goes to the new one, as a move to another room does, staying in this one. What
 * the scene going out shares is put aside, and what comes waits for the new scene.
 */
const followScene = (store: TRuntimeStore, game: TNetGame, event: Extract<TNetEvent, { kind: 'scene' }>): void => {
    const previous = game.scene;
    game.scene = event.scene;
    const outgoing = roomSceneHere(store, game, previous);
    // Not in the room's scene (a menu that connected): nothing to follow.
    if (outgoing === null) return;
    game.status = 'connecting';
    clientSetAsideScene(game.share, outgoing);
    game.transfer = {
        kind: 'scene',
        n: -1,
        line: event.line,
        room: game.room ?? '',
        scene: event.scene,
        players: game.players,
        outgoing,
        transition: game.sceneTransition,
        move: null,
        whole: false,
        started: false,
        failed: false,
        cover: null,
        restartError: null,
    };
    game.held = [];
};

/**
 * The room's scene as this game runs it: the one started as `name`, or the one this game put in the
 * place of the last it went to.
 */
const roomSceneHere = (store: TRuntimeStore, game: TNetGame, name: string | null): TBox | null => {
    const named = runningScene(store, name);
    if (named !== null || game.roomRoot === null) return named;
    const scenes = store.get('world').scenes;
    const at = indexInPlaceOf(scenes, game.roomRoot);
    const now = at >= 0 ? scenes[at] : undefined;
    return now === undefined || isSceneStopped(now) ? null : now;
};

/**
 * Moves a player that changed rooms on to the new room's scene: starts the change once the room has
 * arrived whole and nothing else is being covered, and hands the room to the scene once it runs.
 */
const settle = (store: TRuntimeStore, game: TNetGame, start: boolean): void => {
    const transfer = game.transfer;
    if (transfer === null || transfer.failed) return;
    // The line went meanwhile (a listener disconnected, or connected again): its `disconnect`, at the
    // next step, ends the move; nothing more is started or handed over until then.
    if (game.line === null || game.lineCount !== transfer.line) return;
    const scene = transfer.scene ?? '';
    if (!transfer.started) {
        if (!start || !transfer.whole || store.get('transition').active !== null) return;
        // Following the room's scene, from the one this game put in its place meanwhile too.
        if (transfer.kind === 'scene' && transfer.outgoing !== null
            && (isSceneStopped(transfer.outgoing) || !store.get('world').scenes.includes(transfer.outgoing))) {
            const at = indexInPlaceOf(store.get('world').scenes, transfer.outgoing);
            transfer.outgoing = at >= 0 ? store.get('world').scenes[at]! : null;
        }
        const outgoing = transfer.outgoing;
        if (outgoing === null || isSceneStopped(outgoing) || !store.get('world').scenes.includes(outgoing)) {
            failMove(game, transfer, transfer.kind === 'room'
                ? `the scene of the room it left was not running when it moved to room '${transfer.room}'`
                : `the room's scene was not running when room '${transfer.room}' changed to '${scene}'`);
            return;
        }
        if (transfer.scene === null || !store.get('world').names.has(transfer.scene)) {
            failMove(game, transfer, `the game has no scene '${scene}' for room '${transfer.room}'`);
            return;
        }
        transfer.started = true;
        const transition = transfer.transition !== undefined && canDrawTransition(store, transfer.transition, transfer.kind === 'room' ? 'useNet().joinRoom' : 'useNet().connect\'s sceneTransition')
            ? transfer.transition
            : undefined;
        try {
            replaceScene(store, outgoing, transfer.scene, undefined, transition, (error) => {
                transfer.restartError = { error };
            });
        } catch (error) {
            reportNetError(store, error, transfer.kind === 'room'
                ? `scene '${scene}', built for room '${transfer.room}' as the player moved there`
                : `scene '${scene}', built as room '${transfer.room}' changed to it`);
            failMove(game, transfer, `scene '${scene}' did not start`);
            return;
        }
        transfer.cover = transition === undefined ? null : store.get('transition').active;
        if (store.get('loop').destroyed) return;
    }
    if (transfer.restartError !== null) {
        reportNetError(store, transfer.restartError.error, `scene '${scene}', built again for room '${transfer.room}'`);
        failMove(game, transfer, `scene '${scene}' did not start`);
        return;
    }
    const outgoing = transfer.outgoing!;
    const scenes = store.get('world').scenes;
    const covering = transfer.cover !== null && store.get('transition').active === transfer.cover;
    if (!isSceneStopped(outgoing) && scenes.includes(outgoing)) {
        // Still on screen while it is covered; a change that has gone without taking it away did not
        // bring the new scene in.
        if (!covering) failMove(game, transfer, `scene '${scene}' did not start`);
        return;
    }
    // In its place now: the scene this change built, or one that took its place from its useReady.
    const at = indexInPlaceOf(scenes, outgoing);
    const now = at >= 0 ? scenes[at] : undefined;
    if (now === undefined) {
        if (!covering) failMove(game, transfer, `scene '${scene}' did not start`);
        return;
    }
    if (now.held || isBehindSplash(store, now)) return;
    completeMove(store, game, transfer, now);
};

/**
 * Hands over `events`, in order, changing what the scenes see as each thing is told; while a move
 * waits for its scene, keeps what comes for it.
 */
const handOver = (store: TRuntimeStore, game: TNetGame, events: TNetEvent[]): void => {
    for (const event of events) {
        // Moving to another room's scene: what comes waits for it, unless the line goes.
        if (game.held !== null && event.kind !== 'disconnect') {
            if (event.line !== undefined && event.line !== game.lineCount) continue;
            // The room changed its scene again before this game started on the last: straight to the
            // newest, with the whole room that comes after it.
            if (event.kind === 'scene' && game.transfer !== null && !game.transfer.started) {
                game.transfer.scene = event.scene;
                game.transfer.whole = false;
                game.scene = event.scene;
                // The whole of the scene skipped is not this one's: it waits for the one after.
                game.held = game.held.filter((held) => !(held.kind === 'snap' && held.whole));
                continue;
            }
            game.held.push(event);
            if (event.kind === 'snap' && event.whole && game.transfer !== null) game.transfer.whole = true;
            continue;
        }
        // Said over a line this game has since left for another: that room is not this one.
        if ((event.kind === 'message' || event.kind === 'join' || event.kind === 'leave' || event.kind === 'spawn' || event.kind === 'gone' || event.kind === 'snap' || event.kind === 'replay' || event.kind === 'stores' || event.kind === 'stay')
            && event.line !== undefined && event.line !== game.lineCount) {
            continue;
        }
        switch (event.kind) {
            case 'message': {
                // From a player sent out earlier in this same step: the rest of what they sent is not heard.
                if (event.from !== null && game.server !== null
                    && !(event.via === undefined ? game.server.has(event.from) : game.server.holds(event.from, event.via))) break;
                const set = game.messages.get(event.type);
                if (set !== undefined) tell(store, set, `an onMessage listener of '${event.type}'`, event.data, event.from);
                break;
            }
            case 'join':
                if (!game.players.includes(event.player)) game.players.push(event.player);
                tellWhere(store, game.joins, 'an onJoin listener', outsideArrived(game), event.player);
                break;
            case 'leave':
                game.players = game.players.filter((player) => player !== event.player);
                tellWhere(store, game.leaves, 'an onLeave listener', outsideArrived(game), event.player);
                break;
            case 'connect':
                // Let in: who this player is, already, for the objects the room is about to send
                // (one of them may be its own). It is not 'online' until it sees the room.
                if (event.line !== game.lineCount) break;
                game.me = event.me;
                game.room = event.room;
                game.scene = event.scene;
                game.roomRoot = runningScene(store, event.scene);
                game.players = [...new Set(event.players)];
                game.share.sendRate = event.rate;
                // Fixed when the game says; else it starts safe and follows the line.
                game.share.adaptive = game.interpolation === null;
                game.share.interpolation = game.interpolation ?? Math.max(0.1, 2.5 / event.rate);
                break;
            case 'disconnect': {
                // A move on that line goes no further, first, so what it kept apart is back for
                // what follows.
                abortMove(store, game, event.line, event.reason);
                // Whoever was in the room is gone from this game's point of view, and what the
                // server made goes with them.
                const gone = game.players;
                game.players = [];
                clientOffline(game.share);
                for (const player of gone) tell(store, game.leaves, 'an onLeave listener', player);
                // Unless the game already connected again, which has its own status by now.
                if (event.line === game.lineCount) {
                    game.status = 'closed';
                    game.me = null;
                    game.room = null;
                }
                tell(store, game.disconnects, 'an onDisconnect listener', event.reason);
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
                clientSnap(game.side, event.t, event.ack, event.changes, event.whole);
                // A key kept from the room before that this one does not have starts over.
                if (event.whole) clientSettleKept(game.share);
                // The whole room, after its objects and its stores: now the player sees it, and a
                // scene told so reads the room as it is, not as it starts.
                if (event.whole && game.status === 'connecting' && game.me !== null) {
                    game.status = 'online';
                    tell(store, game.connects, 'an onConnect listener');
                    // Everyone already there, this player among them, as if they had just come: to
                    // the room's new scene only, after following it, as the rest already knew.
                    const arrived = game.arrivedRoot;
                    for (const player of [...game.players]) {
                        tellWhere(store, game.joins, 'an onJoin listener', arrived === null ? null : (box) => box !== null && rootOf(box) === arrived, player);
                    }
                }
                break;
            case 'stores':
                applyRoomStores(store, event.full, event.entries, event.line);
                break;
            case 'arrive':
                if (event.line === game.lineCount) arrive(store, game, event);
                break;
            case 'scene':
                if (event.line === game.lineCount) followScene(store, game, event);
                break;
            case 'stay':
                if (game.moving !== null && game.moving.n === event.n) {
                    const move = game.moving;
                    game.moving = null;
                    move.reject(new Error(`[NacatamalOn] useNet().joinRoom: room '${move.room}' did not take the player, who stays in room '${game.room}' (${event.reason}).`));
                }
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
    describeNetGame(store, () => (made.role === 'server' ? `room '${made.room ?? '?'}' of the server` : "a player's game"));
    const defs = defsOf(store);
    let local: TActionsHandle | null = null;
    const localActions = (): TActionsHandle => {
        local ??= store.get('input').actions.handle('any');
        return local;
    };
    setNetInbox(store, {
        deliver: () => deliver(store, made),
        settle: (start) => settle(store, made, start),
        step: (dt) => {
            if (made.role === 'server') serverStep(store, made.side, defs, dt);
            else clientStep(store, made.side, localActions, defs, dt);
        },
        finish: () => {
            if (made.role === 'server' && made.server !== null) {
                serverFinish(store, made.side);
                made.server.endOfStep();
            }
        },
    });
    if (role === 'client') {
        // A hidden page takes no steps, and what the room sends would wait for its return: hours of
        // it, handed over at once. Meanwhile it is handed over now and then, with no step, and what
        // is kept to be shown later is kept to now.
        const hidden = setInterval(() => {
            // The canvas's page, as everything else of the engine asks it.
            if (pageOf(store.get('screen').canvas)?.hidden !== true || made.inbox.length === 0 || store.get('loop').destroyed) return;
            deliver(store, made);
            clientCatchUp(made.share);
            // What the server ended meanwhile goes now, not when the page comes back.
            flushDestroyed(store);
        }, HIDDEN_DELIVERY * 1000);
        // Never what keeps a process alive (a player's game run by a bot, in Node or Bun).
        (hidden as { unref?: () => void }).unref?.();
        // The line goes with the game: a page that ends its game does not keep its seat in the room.
        store.subscribe('loop', (loop) => loop.destroyed, (destroyed) => {
            if (destroyed) clearInterval(hidden);
            // A move on its way goes no further, and whoever waits for it hears why.
            if (destroyed) dropMove(made, 'the game ended');
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
    const sceneTransition = options.sceneTransition;
    if (sceneTransition !== undefined && (sceneTransition === null || typeof sceneTransition !== 'object' || typeof sceneTransition.fragment !== 'string')) {
        throw new Error('[NacatamalOn] useNet().connect: sceneTransition is a transition, as fade(0.3) gives, and got ' + (sceneTransition === null ? 'null' : typeof sceneTransition) + '.');
    }
    game.sceneTransition = sceneTransition;
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
                // Another version of these messages would be understood in part, or not at all: the
                // line ends, saying so, rather than waiting for a room it cannot read.
                if (wire.v !== WIRE_VERSION) {
                    reason = `the server speaks version ${wire.v} of the game's messages and this game version ${WIRE_VERSION}; run the same build of the engine on both`;
                    ended(reason);
                    line.close(reason);
                    break;
                }
                if (wire.n !== undefined) {
                    queueNet(game, { kind: 'arrive', line: count, me: wire.id, room: wire.room, players: wire.players, rate: wire.r, scene: wire.scene ?? null, n: wire.n });
                    break;
                }
                queueNet(game, { kind: 'connect', line: count, me: wire.id, room: wire.room, players: wire.players, rate: wire.r, scene: wire.scene ?? null });
                break;
            case 'stay':
                queueNet(game, { kind: 'stay', line: count, n: wire.n, reason: wire.reason });
                break;
            case 'scene':
                queueNet(game, { kind: 'scene', line: count, scene: wire.scene });
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
                queueNet(game, { kind: 'snap', line: count, t: wire.t, ack: wire.a, changes: wire.b, whole: wire.w === 1 });
                break;
            case 'st':
                queueNet(game, { kind: 'stores', line: count, full: wire.f === 1, entries: wire.s });
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
 * Asks the server to move this player to another room, over the line it is on.
 */
const joinRoom = (store: TRuntimeStore, game: TNetGame, room: string, options: TNetJoinRoomOptions): Promise<void> => {
    if (typeof room !== 'string' || room === '') {
        throw new Error(`[NacatamalOn] useNet().joinRoom: the room is a name, as in 'pool', and got ${room === '' ? 'an empty string' : typeof room}.`);
    }
    if (options === null || typeof options !== 'object') {
        throw new Error(`[NacatamalOn] useNet().joinRoom: it takes its options in an object, as in { transition: fade(0.3) }, and got ${options === null ? 'null' : typeof options}.`);
    }
    const { token, transition } = options;
    if (token !== undefined && token !== null && typeof token !== 'string') {
        throw new Error(`[NacatamalOn] useNet().joinRoom: token is what proves who the player is, a string, and got ${typeof token}.`);
    }
    if (game.transfer?.kind === 'scene') {
        throw new Error(`[NacatamalOn] useNet().joinRoom: '${room}' was asked for while room '${game.room}' is changing its scene to '${game.transfer.scene}'. Move once onConnect says the new scene is in.`);
    }
    if (game.status !== 'online' || game.line === null) {
        throw new Error(`[NacatamalOn] useNet().joinRoom: the game is not in a room (it is '${game.status}'). Connect first, and move once onConnect has said it is in.`);
    }
    if (game.moving !== null || game.transfer !== null) {
        const to = game.moving?.room ?? game.transfer?.room;
        throw new Error(`[NacatamalOn] useNet().joinRoom: '${room}' was asked for while the player is still moving to room '${to}'. Move once that move's promise has settled.`);
    }
    const from = runningScene(store, game.scene);
    const covering = store.get('transition').active;
    if (from === null || covering?.outgoing === from) {
        const where = game.scene === null ? 'runs no scene this game knows' : `runs '${game.scene}', which is ${from === null ? 'not running' : 'on its way out behind a transition'}`;
        throw new Error(`[NacatamalOn] useNet().joinRoom: it moves the player from the scene of its room, and room '${game.room}' ${where}. Change to the room's scene first, or connect again.`);
    }
    if (room === game.room) return Promise.resolve();
    game.moves += 1;
    const n = game.moves;
    const line = game.line;
    return new Promise<void>((resolve, reject) => {
        game.moving = { n, room, line: game.lineCount, transition, resolve, reject };
        line.send(encodeWire('useNet().joinRoom', { k: 'go', room, n, ...(token === undefined ? {} : { token }) }));
    });
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
        get scene() { return game.scene; },
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
            // Moving to another room: what is said before the player sees it is let go, as the server
            // would let it go.
            if (game.transfer !== null) return;
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

        joinRoom: (room, options = {}) => {
            client('joinRoom');
            return joinRoom(store, game, room, options);
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
