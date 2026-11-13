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
import { createRuntimeStore } from '../store';
import { netGameOf, queueNet } from './net_game';
import { DEFAULT_REWIND_LIMIT, forgetInput, receiveInput, welcomeShared } from './net_share';
import { deliverNet } from './net_inbox';
import { decodeClientWire, encodeWire, WIRE_VERSION } from './protocol';
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
    let interval: ReturnType<typeof setInterval> | null = null;
    let toldStrange = false;

    const send = (player: string, text: string): void => {
        lines.get(player)?.send(text);
    };
    const toEveryone = (text: string, except?: string): void => {
        for (const [player, line] of lines) {
            if (player !== except) line.send(text);
        }
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
        gone(player);
        line.send(encodeWire('room', { k: 'bye', reason }));
        line.close(reason);
    };

    game.server = {
        has: (player) => lines.has(player),
        players: () => [...lines.keys()],
        post: (text, to) => {
            if (to === undefined) toEveryone(text);
            else send(to, text);
        },
        sendTo: (player, type, data) => send(player, encodeWire('useNet().sendTo', { k: 'msg', t: type, d: data })),
        broadcast: (type, data, except) => toEveryone(encodeWire('useNet().broadcast', { k: 'msg', t: type, d: data }), except),
        kick: (player, reason) => leave(player, reason),
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
        store.get('input').keyboard.destroy();
        store.get('input').pointer.destroy();
        store.get('input').gamepads.destroy();
        store.get('audio').manager?.destroy();
        store.get('screen').renderer.destroy();
        store.destroy();
        if (environment) leaveHeadless();
    };

    if (first !== undefined) {
        try {
            startScene(store, first);
        } catch (error) {
            end();
            throw error;
        }
    }
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

    return {
        name,
        get players() { return [...lines.keys()]; },
        get frame() { return Math.round(ctx.time * step); },
        join: (connection, player) => {
            alive('join');
            if (connection === null || typeof connection !== 'object' || typeof connection.send !== 'function' || typeof connection.onMessage !== 'function' || typeof connection.onClose !== 'function') {
                throw new Error(`[NacatamalOn] room '${name}': join takes the player's connection, a TNetConnection with send, onMessage, onClose and close.`);
            }
            if (player !== undefined && (typeof player !== 'string' || player === '')) {
                throw new Error(`[NacatamalOn] room '${name}': a player's name is a string, as in 'ana', and got ${player === '' ? 'an empty string' : typeof player}.`);
            }
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
                // A `hello` was for whoever let the player in: here it is already in.
                if (wire.k === 'msg') queueNet(game, { kind: 'message', type: wire.t, data: wire.d, from: id });
                else if (wire.k === 'in') receiveInput(game.share, id, wire);
                // Answered at once: what is measured is the line, not the wait for a step.
                else if (wire.k === 'ping') connection.send(encodeWire('room', { k: 'pong', n: wire.n }));
            });
            connection.onClose(() => {
                if (lines.get(id) === connection) gone(id);
            });
            connection.send(encodeWire('room', { k: 'welcome', v: WIRE_VERSION, id, room: name, players: [...lines.keys()], r: game.share.sendRate }));
            toEveryone(encodeWire('room', { k: 'join', id }), id);
            // Everything already shared, made and placed, before anything new.
            welcomeShared(store, game.side, id);
            queueNet(game, { kind: 'join', player: id });
            if (before !== undefined) {
                const reason = 'connected from somewhere else';
                before.send(encodeWire('room', { k: 'bye', reason }));
                before.close(reason);
            }
            return id;
        },
        leave: (player, reason = 'sent out of the room') => {
            alive('leave');
            leave(player, reason);
        },
        step: (frames = 1) => {
            alive('step');
            for (let i = 0; i < frames; i++) advance(frameMs, true);
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
};
