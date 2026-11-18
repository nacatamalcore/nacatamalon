import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene, useGame, useSelf, useUpdate } from '../src';
import { createHeadlessGame } from '../src/headless';
import { connectLoopback, createServer, useNet, useNetSpawn, useShared } from '../src/net';
import { fade } from '../src/transition';
import type { THeadlessGame } from '../src/headless';
import type { TNetConnection, TNetHandle, TServer, TServerOptions } from '../src/net';
import type { TGameObject, TSceneFn } from '../src';

/**
 * The ways a move to another room (`useNet().joinRoom`) can go that the main tests do not walk:
 * `admit` that never answers, the new room failing once there is no going back, a word of the old
 * room just ahead of the new one's welcome, a move that ends in a frame with no step, and what the
 * new room shares after a move under a fade.
 */

const settle = (ms = 5) => new Promise((done) => setTimeout(done, ms));

let server: TServer | null = null;
const games: THeadlessGame[] = [];

afterEach(() => {
    for (const game of games.splice(0)) {
        try {
            game.destroy();
        } catch {
            // Already ended by the test.
        }
    }
    server?.close();
    server = null;
});

const roomScene = (room: string): string | null => {
    if (room === 'lobby') return 'Lobby';
    if (room === 'pool') return 'Pool';
    return null;
};

/** What each player's game heard, in order, by the scene that heard it. */
let log: string[] = [];

type THooks = {
    server?: (net: TNetHandle, place: string) => void;
    client?: (net: TNetHandle, place: string) => void;
};

/** A place of the game, the same on both sides, with what the test adds. */
const place = (name: string, hooks: THooks = {}): TSceneFn => () => {
    const net = useNet();
    if (net.role === 'server') hooks.server?.(net, name);
    else {
        net.onConnect(() => log.push(`${name}: connect '${net.room}'`));
        net.onDisconnect((reason) => log.push(`${name}: disconnect ${reason}`));
        hooks.client?.(net, name);
    }
    return createScene();
};

/** Steps every game a frame, and every room of the server a step after it. */
const pump = async (times = 1) => {
    for (let i = 0; i < times; i++) {
        await settle();
        for (const game of games) game.run(1);
        for (const name of server?.rooms ?? []) server!.room(name)!.step(1);
    }
};

const startServer = (hooks: THooks = {}, options: Partial<TServerOptions> = {}) => {
    log = [];
    server = createServer({ width: 160, height: 90, scenes: { Lobby: place('Lobby', hooks), Pool: place('Pool', hooks) }, clock: false, step: 60, roomScene, ...options });
    return server;
};

/** A player's game connected to the lobby over `line`, its scenes' handles kept as they are built. */
const player = (line: () => TNetConnection = () => connectLoopback(server!), hooks: THooks = {}) => {
    const nets: TNetHandle[] = [];
    let connected = false;
    const client = (net: TNetHandle, name: string): void => {
        nets.push(net);
        hooks.client?.(net, name);
        if (!connected) {
            connected = true;
            net.connect(line(), { room: 'lobby' });
        }
    };
    const game = createHeadlessGame({
        width: 160,
        height: 90,
        scenes: { Lobby: place('Lobby', { client }), Pool: place('Pool', { client }) },
    });
    games.push(game);
    return { game, net: () => nets.at(-1)!, scenes: () => [...game.scenes] };
};

/**
 * A line to the server whose server end is looked through: `sent` is everything the server sent the
 * player, in order, and `failSend` may throw for a message the server sends.
 */
const watchedLine = (failSend: (text: string) => boolean = () => false) => {
    const sent: string[] = [];
    const through = {
        accept: (line: TNetConnection) => server!.accept({
            send: (text) => {
                if (failSend(String(text))) throw new Error('the line broke');
                sent.push(String(text));
                line.send(text);
            },
            onMessage: (listener) => line.onMessage(listener),
            onClose: (listener) => line.onClose(listener),
            close: (reason) => line.close(reason),
        }),
    } as unknown as TServer;
    return { line: () => connectLoopback(through), sent };
};

describe('nacatamalon/net: joinRoom, the ways a move can go', () => {
    it('stays in its room when admit never answers, its promise refused once the server stops waiting', async () => {
        // The server waits 15 seconds for `admit`: here, a few milliseconds.
        const realTimeout = globalThis.setTimeout;
        const timeouts = spyOn(globalThis, 'setTimeout').mockImplementation(((handler: () => void, ms?: number, ...rest: unknown[]) =>
            realTimeout(handler, ms === 15000 ? 30 : ms, ...rest)) as unknown as typeof setTimeout);
        try {
            const said: string[] = [];
            startServer({ server: (net, name) => net.onMessage('hi', (_data, from) => said.push(`${name} ${from}`)) }, {
                // In at once from outside; from another room, a question nobody answers.
                admit: ({ from }) => (from === undefined ? true : new Promise<boolean>(() => {})),
            });
            const ana = player();
            await pump(4);
            let reason = '';
            ana.net().joinRoom('pool').catch((error: Error) => { reason = error.message; });
            await pump(3);
            // Still deciding: in the lobby, and what it says still reaches the lobby.
            expect(reason).toBe('');
            ana.net().send('hi');
            await pump(2);
            expect(said).toEqual(['Lobby player-1']);
            await settle(60);
            await pump(3);
            expect(reason).toContain("did not take the player, who stays in room 'lobby' (it was not let in in time)");
            expect(ana.net().room).toBe('lobby');
            expect(ana.net().status).toBe('online');
            expect(ana.scenes()).toEqual(['Lobby']);
            expect(server!.rooms).toEqual(['lobby']);
        } finally {
            timeouts.mockRestore();
        }
    });

    it('closes the line when the new room fails to take the player once the old one let it go, leaving it in no room', async () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        try {
            startServer();
            // The welcome of the move (the one that says its number) cannot go: the new room throws
            // as it lets the player in, past the point where the old one let it go.
            const watched = watchedLine((text) => text.includes('"k":"welcome"') && text.includes('"n":'));
            const ana = player(watched.line);
            await pump(4);
            expect(ana.net().room).toBe('lobby');
            let reason = '';
            ana.net().joinRoom('pool').catch((e: Error) => { reason = e.message; });
            await pump(6);
            expect(ana.net().status).toBe('closed');
            expect(reason).toContain("room 'pool' could not take the player");
            expect(log).toContain("Lobby: disconnect room 'pool' could not take the player");
            // Nobody left behind on the server: both rooms ended with no one in them.
            expect(server!.rooms).toEqual([]);
            expect(error).toHaveBeenCalled();
        } finally {
            error.mockRestore();
        }
    });

    it('keeps a word of the room it leaves, said just ahead of the new room\'s welcome, from the new scene', async () => {
        const heard: string[] = [];
        let ticks = 0;
        startServer({
            server: (net, name) => {
                // The lobby says something every step; the pool never does.
                if (name === 'Lobby') useUpdate(() => net.broadcast('tick', (ticks += 1)));
            },
        });
        const watched = watchedLine();
        const ana = player(watched.line, { client: (net, name) => net.onMessage('tick', () => heard.push(name)) });
        await pump(4);
        heard.length = 0;
        void ana.net().joinRoom('pool');
        await pump(8);
        expect(ana.net().room).toBe('pool');
        expect(ana.scenes()).toEqual(['Pool']);
        // On the line, a tick of the lobby went right before the welcome of the move.
        const welcome = watched.sent.findIndex((text) => text.includes('"k":"welcome"') && text.includes('"n":'));
        expect(welcome).toBeGreaterThan(0);
        expect(watched.sent.slice(0, welcome).some((text) => text.includes('"tick"'))).toBe(true);
        // Heard, if at all, by the lobby; never by the pool.
        expect(heard.every((name) => name === 'Lobby')).toBe(true);
        expect(log).toEqual(["Lobby: connect 'lobby'", "Pool: connect 'pool'"]);
    });

    it('ends a move under a fade in a frame with no step, the new scene connected before it updates', async () => {
        startServer();
        let updates = 0;
        const ana = player(undefined, {
            client: (net, name) => {
                // Slow motion: a step every fourth frame, the fade going on real time.
                if (name === 'Lobby') useGame().setTimeScale(0.25);
                useUpdate(() => { updates += 1; });
            },
        });
        await pump(4);
        log = [];
        let kept = false;
        void ana.net().joinRoom('pool', { transition: fade(0.1) }).then(() => { kept = true; });
        let connectedWithout: boolean | null = null;
        for (let i = 0; i < 60 && connectedWithout === null; i++) {
            await settle();
            const before = updates;
            ana.game.run(1);
            for (const name of server!.rooms) server!.room(name)!.step(1);
            if (log.includes("Pool: connect 'pool'")) connectedWithout = updates === before;
        }
        // Connected in a frame that took no step: the room handed over there, not a step later.
        expect(connectedWithout).toBe(true);
        await pump(8);
        expect(kept).toBe(true);
        expect(ana.scenes()).toEqual(['Pool']);
        expect(ana.net().room).toBe('pool');
        expect(log).toEqual(["Pool: connect 'pool'"]);
    });

    it('shows what the new room shares where the room has it, moving on, after a move under a fade', async () => {
        let roomBall: TGameObject | null = null;
        const Ball = () => {
            const self = useSelf();
            useShared({ fields: {} });
            if (useNet().role === 'server') useUpdate(() => { self.transform!.x += 1; });
        };
        const hooks: THooks = {
            server: (net, name) => {
                const spawn = useNetSpawn('ball', Ball);
                if (name === 'Pool') net.onJoin(() => { roomBall ??= spawn(); });
            },
            client: () => {
                useNetSpawn('ball', Ball);
            },
        };
        startServer(hooks);
        const ana = player(undefined, hooks);
        // A lobby a few seconds old, a pool made for the move: their clocks are far apart.
        await pump(200);
        void ana.net().joinRoom('pool', { transition: fade(0.1) });
        await pump(30);
        expect(ana.scenes()).toEqual(['Pool']);
        const ball = () => ana.game.findAll('Ball').find((box) => !box.destroyed);
        expect(ball()).toBeDefined();
        const first = ball()!.transform!.x;
        await pump(20);
        const then = ball()!.transform!.x;
        // Moving on, a step at a time like the room's, and only a moment behind it.
        expect(then - first).toBeGreaterThan(15);
        expect(roomBall!.transform!.x - then).toBeGreaterThanOrEqual(0);
        expect(roomBall!.transform!.x - then).toBeLessThan(10);
    });
});
