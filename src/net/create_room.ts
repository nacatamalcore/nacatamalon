import { noteFoundByName, teardownBox } from '../box';
import { createAudioManager } from '../audio/create_audio_manager';
import { cleanGameOptions } from '../game/bootstrap/clean_gameoptions';
import { createFrameContext } from '../game/loop';
import { advanceFrame } from '../game/loop/tick';
import { startGameSystems, stopGameSystems } from '../game_systems/game_systems';
import { enterHeadless, leaveHeadless } from '../headless/headless_environment';
import { createScreenlessCanvas } from '../headless/screenless_canvas';
import { SilentAudioContext } from '../headless/silent_audio';
import { pendingWorkOf } from '../loaders/pending_work';
import { registerScene, startScene } from '../scene';
import { listenScenePlaces } from '../scene/start_scene';
import { isSceneStopped } from '../scene/stopped_scenes';
import { createRuntimeStore } from '../store';
import { listGameStores } from '../game_store/store_registry';
import { netGameOf, queueNet } from './net_game';
import { DEFAULT_REWIND_LIMIT, forgetInput, receiveInput, serverRestore, serverSetAside, welcomeShared } from './net_share';
import type { TSharedEntry } from './net_share';
import { deliverNet } from './net_inbox';
import { decodeClientWire, encodeWire, WIRE_VERSION } from './protocol';
import { checkRoomStoreDecl, closeRoomStores, flushRoomStores, roomStoreHandle, roomStoreInstance, wholeRoomStores } from './room_store';
import type { TBox } from '../box';
import type { TGameConfig } from '../game/types/t_game_config';
import type { TGameObject } from '../hooks';
import type { IRenderer } from '../render/interface/i_renderer';
import type { TRuntimeStore } from '../store';
import type { TNetConnection } from './types/t_net_connection';
import type { TRoom, TRoomOptions } from './types/t_room';

/** Steps a second when a room does not say. */
const DEFAULT_STEP = 60;

/** How many times a second a room tells its players where things are, when it does not say. */
const DEFAULT_SEND_RATE = 30;

/** A wait for files of more than two minutes is a wait in milliseconds. */
const LONGEST_LOADED_WAIT = 120;

/**
 * A renderer that draws nothing: a room is never seen, so what its scenes hand over each frame goes
 * nowhere, and costs nothing kept.
 */
const createNothingRenderer = (): IRenderer => {
    const texture = () => ({ resourceType: 'texture' as const });
    return {
        capabilities: { backend: 'WEBGPU', msaa: 1 },
        // Nothing to draw, so a crossing's picture of the scene going out counts as taken: a change
        // of scene must not wait for a card that is not there.
        frame: (ctx) => {
            for (const effect of ctx.post ?? []) {
                if (effect.outgoing === 'take') effect.outgoing = 'taken';
            }
        },
        createTexture: texture,
        setSmooth: () => {},
        createBuffer: () => ({ resourceType: 'buffer' }),
        updateBuffer: () => {},
        destroyBuffer: () => {},
        createDataTexture: texture,
        updateDataTexture: () => {},
        createRenderTexture: texture,
        readTexture: async () => ({ width: 0, height: 0, data: new Uint8Array(0) }),
        destroyTexture: () => {},
        destroy: () => {},
    };
};

/**
 * Whether files have to be read from disk: in Bun or Node. A page and a worker fetch them from their
 * own address, as the players' games do.
 */
const readsFromDisk = (): boolean => typeof document === 'undefined'
    && typeof (globalThis as { process?: { getBuiltinModule?: unknown } }).process?.getBuiltinModule === 'function';

/** Whether this process has been told that its games' stores are shared by every room. */
let toldPageStores = false;

/**
 * Said once, with the first room: the game's stores (`createGameStore`) are one for the whole
 * process, so every room of a server writes on the same one. What belongs to one room goes in a
 * room store.
 */
const tellPageStores = (): void => {
    if (toldPageStores) return;
    const keys = listGameStores().map((store) => store.key);
    if (keys.length === 0) return;
    toldPageStores = true;
    console.warn(`[NacatamalOn] createRoom: the game's stores ${keys.map((key) => `'${key}'`).join(', ')} are one for the whole process, so every room of this server shares them (said once). For what belongs to one room (its score, its round), use createRoomStore from nacatamalon/net.`);
};

/**
 * What `createServer` does with its own rooms and a room of someone else's server cannot: let a
 * player in who moved from another room (its `welcome` carries the number of the move), and let one
 * go without ending its line, as it moves on.
 *
 * @internal
 */
export type TRoomInternal = {
    join(connection: TNetConnection, player: string | undefined, move: number | undefined): string;
    /** Whether `player` was in on that very connection, and is let go now. */
    release(player: string, connection: TNetConnection): boolean;
};

const internals = new WeakMap<TRoom, TRoomInternal>();

/**
 * The part of a room only `createServer` uses.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const roomInternal = (room: TRoom): TRoomInternal => internals.get(room)!;

/** A name to give a player who comes with none: short, and never one already used in this room. */
const nameFor = (taken: Map<string, unknown>, count: number): string => {
    let n = count;
    while (taken.has(`player-${n}`)) n += 1;
    return `player-${n}`;
};

/**
 * Makes a room: the game's own scenes running with no screen and no sound, deciding what happens,
 * with players coming in over their connections. The scenes are the same a player's page runs, and
 * `useNet().role` is `'server'` in them, so the code that decides (who won, how many coins) runs
 * here and nowhere else.
 *
 * `createServer` makes these on its own, one for each room asked for. This is for a server of
 * someone else's (socket.io, or a framework with rooms of its own) that holds the rooms itself: it lets each player in with
 * `join`, over their connection wrapped as a {@link TNetConnection}, and, with `clock: false`, moves
 * the room with `step()` from its own loop.
 *
 * It runs in a page, in Bun and in Node. In a page it is never heard, and its files come from the
 * page's address; elsewhere they are read from `assets`.
 *
 * @example
 * ```ts
 * import { createScene, type TSceneFn } from 'nacatamalon';
 * import { createRoom } from 'nacatamalon/net';
 *
 * // The game's own scene, as its players' pages run it.
 * const Lobby: TSceneFn = () => createScene();
 *
 * // What of socket.io's server this uses (`import { Server } from 'socket.io'`).
 * type Socket = {
 *     emit(event: string, text: string): void;
 *     on(event: string, listener: (value: string) => void): void;
 *     disconnect(): void;
 * };
 * declare const io: { on(event: 'connection', listener: (socket: Socket) => void): void };
 *
 * const room = createRoom({ width: 320, height: 180, scenes: { Lobby }, step: 20, name: 'lobby' });
 *
 * io.on('connection', (socket) => {
 *     let hear: (text: string) => void = () => {};
 *     socket.on('naca', (text) => hear(text));
 *     room.join({
 *         send: (text) => socket.emit('naca', text),
 *         onMessage: (listener) => { hear = listener; },
 *         onClose: (listener) => socket.on('disconnect', (reason) => listener(reason)),
 *         close: () => socket.disconnect(),
 *     });
 * });
 * ```
 *
 * @param options The game's options and scenes, the room's name and how it keeps time.
 * @returns The room, already running unless `clock` is `false`.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createRoom = (options: TRoomOptions): TRoom => {
    const { scenes, initialScene, assets = 'public', name = 'main', clock = true, sendRate, rewindLimit = DEFAULT_REWIND_LIMIT, ...gameOptions } = options;
    if (scenes === null || typeof scenes !== 'object' || Array.isArray(scenes)) {
        throw new Error('[NacatamalOn] createRoom: scenes go in an object keyed by name, e.g. { Lobby }.');
    }
    if (initialScene !== undefined && !Object.hasOwn(scenes, initialScene)) {
        throw new Error(`[NacatamalOn] createRoom: initial scene '${initialScene}' is not in the scenes object.`);
    }
    if (typeof name !== 'string' || name === '') {
        throw new Error('[NacatamalOn] createRoom: a room\'s name is a name, as in \'lobby\'.');
    }
    const step = gameOptions.step ?? DEFAULT_STEP;
    if (typeof step !== 'number' || !Number.isFinite(step) || step <= 0) {
        throw new Error(`[NacatamalOn] createRoom: step is how many steps a second the room runs, and got ${String(step)}. 20 is plenty for walking and chatting; 60 for quick reactions.`);
    }
    if (typeof rewindLimit !== 'number' || !Number.isFinite(rewindLimit) || rewindLimit < 0 || rewindLimit > 1) {
        throw new Error(`[NacatamalOn] createRoom: rewindLimit is how far back useNet().rewind may look, in seconds from 0 to 1, and got ${String(rewindLimit)}. 0.25 covers players up to about 200 ms of ping.`);
    }
    const rate = sendRate ?? Math.min(step, DEFAULT_SEND_RATE);
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > step) {
        throw new Error(`[NacatamalOn] createRoom: sendRate is how many times a second the room tells its players where things are, more than 0 and at most its step (${step}), and got ${String(sendRate)}.`);
    }
    const config = cleanGameOptions({
        ...gameOptions,
        step,
        seed: gameOptions.seed,
        pauseOnBlur: false,
        banner: false,
        splash: false,
    }) as TGameConfig;

    tellPageStores();
    const environment = readsFromDisk();
    if (environment) enterHeadless(assets);

    const { canvas } = createScreenlessCanvas(config.width, config.height);
    let store: TRuntimeStore;
    try {
        store = createRuntimeStore({ canvas, renderer: createNothingRenderer(), config });
    } catch (error) {
        if (environment) leaveHeadless();
        throw error;
    }
    // Never heard, even in the page where its players are: their sound is theirs.
    store.setState('audio', { manager: createAudioManager(null, new (SilentAudioContext as unknown as typeof AudioContext)()) });

    const game = netGameOf(store, 'server');
    game.room = name;
    // Every so many steps, the nearest whole number to what was asked.
    game.share.stepsPerSend = Math.max(1, Math.round(step / rate));
    game.share.sendRate = step / game.share.stepsPerSend;
    game.share.rewindLimit = rewindLimit;

    /** Each player's line, in the order they came. */
    const lines = new Map<string, TNetConnection>();
    let made = 0;
    let destroyed = false;
    /** Past its last delivery and cleanups: its stores are closed. */
    let ended = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let toldStrange = false;

    /**
     * The room's scene, which its players follow: the root that started it, and whatever takes its
     * place. `held` keeps what the room says while a new one is being built in its place, sent once
     * it is built or let go if it throws; `waiting`, the new one, until it runs and the players are
     * sent the whole room again.
     */
    const scene: {
        root: TBox | null;
        name: string | null;
        held: Array<[TNetConnection, string]> | null;
        building: { old: TBox; root: TBox; name: string; apart: TSharedEntry[] } | null;
        waiting: TBox | null;
        /** While `waiting`: the scene it replaces, still the one the room runs for who comes in. */
        before: string | null;
        /** While the room's first scene is built: a change from its `useReady` is the room's too. */
        booting: boolean;
    } = { root: null, name: null, held: null, building: null, waiting: null, before: null, booting: false };

    /** A line of text to one player's line, or kept while the room's scene is being built. */
    const out = (line: TNetConnection, text: string): void => {
        if (scene.held !== null) scene.held.push([line, text]);
        else line.send(text);
    };
    const everyone = (text: string, except?: string): void => {
        for (const [player, line] of lines) {
            if (player !== except) out(line, text);
        }
    };
    /**
     * What the room's stores changed, told before anything else the room says: a `set` and then a
     * `broadcast` arrive in that order, and whoever hears the message reads the store as it is.
     */
    const flush = (): void => {
        const text = flushRoomStores(store);
        if (text !== null) everyone(text);
    };
    const send = (player: string, text: string): void => {
        flush();
        const line = lines.get(player);
        if (line !== undefined) out(line, text);
    };
    const toEveryone = (text: string, except?: string): void => {
        flush();
        everyone(text, except);
    };
    const gone = (player: string): void => {
        lines.delete(player);
        forgetInput(game.share, player);
        queueNet(game, { kind: 'leave', player });
        toEveryone(encodeWire('room', { k: 'leave', id: player }));
    };
    const leave = (player: string, reason: string): void => {
        const line = lines.get(player);
        if (line === undefined) return;
        // What changed last (the round's end) reaches the player before their line does.
        flush();
        gone(player);
        line.send(encodeWire('room', { k: 'bye', reason }));
        line.close(reason);
    };

    game.server = {
        has: (player) => lines.has(player),
        holds: (player, via) => lines.get(player) === via,
        players: () => [...lines.keys()],
        post: (text, to) => {
            if (to === undefined) toEveryone(text);
            else send(to, text);
        },
        sendTo: (player, type, data) => send(player, encodeWire('useNet().sendTo', { k: 'msg', t: type, d: data })),
        broadcast: (type, data, except) => toEveryone(encodeWire('useNet().broadcast', { k: 'msg', t: type, d: data }), except),
        kick: (player, reason) => leave(player, reason),
        endOfStep: () => {
            settleScene();
            flush();
        },
    };

    for (const [sceneName, scene] of Object.entries(scenes)) {
        registerScene(store, sceneName, scene);
    }
    const first = initialScene ?? Object.keys(scenes)[0];
    startGameSystems(store);
    const ctx = createFrameContext();
    const frameMs = 1000 / step;

    const end = (): void => {
        store.setState('loop', { destroyed: true });
        for (const scene of store.get('world').scenes) {
            teardownBox(scene);
        }
        stopGameSystems(store);
        // After the cleanups and the systems' last words, which may still keep what the room won,
        // through room.store too.
        ended = true;
        closeRoomStores(store);
        store.get('input').keyboard.destroy();
        store.get('input').pointer.destroy();
        store.get('input').gamepads.destroy();
        store.get('audio').manager?.destroy();
        store.get('screen').renderer.destroy();
        store.destroy();
        if (environment) leaveHeadless();
    };

    // A scene built in the place of the room's: the players follow it (see `followScene`).
    listenScenePlaces(store, {
        started: (old, root, name) => {
            // The first scene changing from its own `useReady`, before the room has it.
            if (scene.booting && scene.root === null) scene.root = old;
            if (old !== scene.root || scene.building !== null) return;
            flush();
            // Its keys free for the scene coming in: the players put theirs aside themselves.
            scene.building = { old, root, name, apart: serverSetAside(game.share, old) };
            scene.held = [];
            everyone(encodeWire('room', { k: 'scene', scene: name }));
        },
        built: (root, ok) => {
            const building = scene.building;
            if (building === null || building.root !== root) return;
            scene.building = null;
            const held = scene.held ?? [];
            scene.held = null;
            if (!ok) {
                // Nothing of it reaches anyone: the room stays in its scene, as do its players. What
                // the failed scene shared goes, what the old one had comes back, and the stores are
                // sent whole, as a change of them may have been in what was let go.
                serverRestore(game.share, building.apart, root);
                if (held.some(([, text]) => text.startsWith('{"k":"st"'))) everyone(wholeRoomStores(store));
                return;
            }
            if (scene.waiting === null) scene.before = scene.name;
            scene.root = root;
            scene.name = building.name;
            game.scene = building.name;
            scene.waiting = root;
            for (const [line, text] of held) line.send(text);
        },
    });

    if (first !== undefined) {
        try {
            scene.booting = true;
            const started = startScene(store, first);
            scene.booting = false;
            // Unless its useReady already put another in its place, which the room follows.
            if (scene.name === null) {
                scene.root = started;
                scene.name = first;
                game.scene = first;
            }
        } catch (error) {
            end();
            throw error;
        }
    }

    /**
     * Once the room's new scene runs (the old one gone, the new one not held behind a cover): every
     * player is sent the whole room again, as someone coming in. Left with no scene (the new one
     * stopped itself on its way in), the players' lines end, saying so.
     */
    const settleScene = (): void => {
        const waiting = scene.waiting;
        if (waiting === null) return;
        const scenes = store.get('world').scenes;
        if (scenes.includes(waiting) && !isSceneStopped(waiting)) {
            if (waiting.held) return;
            scene.waiting = null;
            scene.before = null;
            for (const player of lines.keys()) welcomeShared(store, game.side, player, wholeRoomStores(store));
            return;
        }
        // Still covering, with the swap to come.
        if (store.get('transition').active !== null) return;
        scene.waiting = null;
        scene.before = null;
        const reason = `room '${name}' was left with no scene`;
        console.error(`[NacatamalOn] room '${name}': scene '${scene.name}' stopped on its way in, and the room has no scene for its players, whose lines were ended. A scene that stops itself in its useReady takes the room's place with it.`);
        for (const player of [...lines.keys()]) leave(player, reason);
    };
    // The first frame, with no time in it: what the scenes made, ready for the first player.
    advanceFrame(store, ctx, 0);

    /** Runs the steps owed `elapsed` milliseconds after the last, and says what threw. */
    const advance = (elapsed: number, rethrow: boolean): void => {
        advanceFrame(store, ctx, elapsed);
        const { failure } = store.get('loop');
        if (failure !== null) {
            // Said already, by the scene's report; cleared so the next one is heard too.
            store.setState('loop', { failure: null });
            if (rethrow) throw failure;
        }
    };

    if (clock) {
        let last = performance.now();
        interval = setInterval(() => {
            const now = performance.now();
            const elapsed = now - last;
            last = now;
            advance(elapsed, false);
        }, frameMs);
    }

    const every = (wanted: string): TGameObject[] => {
        const found: TBox[] = [];
        const visit = (box: TBox): void => {
            if (box.name === wanted) {
                noteFoundByName(box, wanted);
                found.push(box);
            }
            box.children.forEach(visit);
        };
        store.get('world').scenes.forEach(visit);
        return found as TGameObject[];
    };

    const alive = (what: string): void => {
        if (destroyed) throw new Error(`[NacatamalOn] room '${name}': ${what} after destroy().`);
    };

    /**
     * Lets a player in over `connection`, under `player` or a name of the room's; `move`, the number
     * of the move that brought them from another room of the same server.
     */
    const letIn = (connection: TNetConnection, player: string | undefined, move: number | undefined): string => {
        alive('join');
        if (connection === null || typeof connection !== 'object' || typeof connection.send !== 'function' || typeof connection.onMessage !== 'function' || typeof connection.onClose !== 'function') {
            throw new Error(`[NacatamalOn] room '${name}': join takes the player's connection, a TNetConnection with send, onMessage, onClose and close.`);
        }
        if (player !== undefined && (typeof player !== 'string' || player === '')) {
            throw new Error(`[NacatamalOn] room '${name}': a player's name is a string, as in 'ana', and got ${player === '' ? 'an empty string' : typeof player}.`);
        }
        // Whoever is already in hears what changed before anyone new is let in.
        flush();
        made += 1;
        const id = player ?? nameFor(lines, made);
        // The same player again, from another tab: the one before goes, after this one is in, so
        // the room is never empty in between.
        const before = lines.get(id);
        if (before !== undefined) gone(id);
        lines.set(id, connection);
        connection.onMessage((text) => {
            if (lines.get(id) !== connection) return;
            const wire = decodeClientWire(String(text));
            if (wire === null) {
                if (!toldStrange) {
                    toldStrange = true;
                    console.warn(`[NacatamalOn] room '${name}': player '${id}' sent something that is not one of the engine's messages, and it was left out: ${String(text).slice(0, 80)}`);
                }
                return;
            }
            // A `hello` was for whoever let the player in: here it is already in. A move to another
            // room is for a server with several, which this is not part of.
            if (wire.k === 'go') {
                connection.send(encodeWire('room', { k: 'stay', n: wire.n, reason: 'this server does not move players between rooms' }));
            } else if (wire.k === 'msg') queueNet(game, { kind: 'message', type: wire.t, data: wire.d, from: id, via: connection });
            else if (wire.k === 'in') receiveInput(game.share, id, wire);
            // Answered at once: what is measured is the line, not the wait for a step.
            else if (wire.k === 'ping') {
                // After what the stores changed, as everything the room sends.
                flush();
                connection.send(encodeWire('room', { k: 'pong', n: wire.n }));
            }
        });
        connection.onClose(() => {
            if (lines.get(id) === connection) gone(id);
        });
        // The scene the room runs, so a player moving in can go to it; and the move, so it knows
        // this is the room it asked for.
        const said = scene.before ?? scene.name;
        connection.send(encodeWire('room', {
            k: 'welcome', v: WIRE_VERSION, id, room: name, players: [...lines.keys()], r: game.share.sendRate,
            // The scene running now: while the room's is changing, the one going out, and the new one
            // said right after, as everyone in was told.
            ...(said === null ? {} : { scene: said }),
            ...(move === undefined ? {} : { n: move }),
        }));
        toEveryone(encodeWire('room', { k: 'join', id }), id);
        // Everything already shared, made and placed, before anything new. While the room's scene
        // is changing, the snapshot of the whole room waits for the new one to run (`settleScene`).
        welcomeShared(store, game.side, id, wholeRoomStores(store), scene.waiting === null);
        if (scene.waiting !== null && scene.name !== null) send(id, encodeWire('room', { k: 'scene', scene: scene.name }));
        queueNet(game, { kind: 'join', player: id });
        if (before !== undefined) {
            const reason = 'connected from somewhere else';
            before.send(encodeWire('room', { k: 'bye', reason }));
            before.close(reason);
        }
        return id;
    };

    const room: TRoom = {
        name,
        get players() { return [...lines.keys()]; },
        get frame() { return Math.round(ctx.time * step); },
        join: (connection, player) => letIn(connection, player, undefined),
        leave: (player, reason = 'sent out of the room') => {
            alive('leave');
            leave(player, reason);
        },
        step: (frames = 1) => {
            alive('step');
            for (let i = 0; i < frames; i++) advance(frameMs, true);
        },
        store: (decl) => {
            // Still open while the room delivers its last events and runs its cleanups.
            if (ended) throw new Error(`[NacatamalOn] room '${name}': store after destroy().`);
            checkRoomStoreDecl(`room '${name}': store`, decl);
            const instance = roomStoreInstance(store, game, decl as never, `room '${name}': store`);
            return roomStoreHandle(store, game, instance, null);
        },
        find: (wanted) => every(wanted)[0],
        findAll: every,
        loaded: async (timeout = 5) => {
            if (typeof timeout !== 'number' || !(timeout > 0) || timeout > LONGEST_LOADED_WAIT) {
                throw new Error(`[NacatamalOn] room '${name}': loaded's timeout is in seconds, more than 0 and at most ${LONGEST_LOADED_WAIT}, and got ${String(timeout)}.`);
            }
            const until = Date.now() + timeout * 1000;
            const scenesNow = () => store.get('world').scenes;
            const busy = () => scenesNow().some((scene) => scene.loads.some((load) => load.status === 'loading') || pendingWorkOf(scene).length > 0);
            while (!destroyed && busy()) {
                if (Date.now() > until) {
                    throw new Error(`[NacatamalOn] room '${name}': still loading after ${timeout} seconds.`);
                }
                await new Promise((done) => setTimeout(done, 0));
            }
        },
        destroy: () => {
            if (destroyed) return;
            destroyed = true;
            if (interval !== null) clearInterval(interval);
            for (const player of [...lines.keys()]) leave(player, 'the room closed');
            // What the scenes have not heard yet, the last players leaving among it, is told before
            // they go: where a player leaves is where a game keeps what they won.
            deliverNet(store);
            end();
        },
    };
    internals.set(room, {
        join: letIn,
        release: (player, connection) => {
            if (destroyed || lines.get(player) !== connection) return false;
            // What changed last reaches the player before it goes, and the others hear it leave.
            flush();
            gone(player);
            return true;
        },
    });
    return room;
};
