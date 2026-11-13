import { afterEach, describe, expect, it } from 'bun:test';
import { createScene, useUpdate } from '../src';
import { createHeadlessGame } from '../src/headless';
import { connectLoopback, createRoom, createServer, useNet } from '../src/net';
import type { THeadlessGame } from '../src/headless';
import type { TNetHandle, TServer, TServerOptions } from '../src/net';
import type { TSceneFn } from '../src';

/**
 * The server and two players in one process, on the line in memory: the same scene runs in the
 * room and in each player's game, and what one says reaches the others through the server.
 */

/** Lets what is on its way over the pretend line arrive. */
const settle = () => new Promise((done) => setTimeout(done, 5));

type TLog = { role: string; me: string | null; what: string }[];

let server: TServer | null = null;
const games: THeadlessGame[] = [];

afterEach(() => {
    for (const game of games.splice(0)) game.destroy();
    server?.close();
    server = null;
});

/** A lobby where the server welcomes each player and repeats what they say, and the players write down what they hear. */
const makeLobby = (log: TLog, connectAs: (net: TNetHandle) => void): TSceneFn => () => {
    const net = useNet();
    const note = (what: string) => log.push({ role: net.role, me: net.me, what });
    net.onJoin((player) => note(`join ${player}`));
    net.onLeave((player) => note(`leave ${player}`));
    if (net.role === 'server') {
        net.onMessage<string>('say', (text, from) => {
            note(`heard ${from}: ${text}`);
            net.broadcast('said', { from, text });
        });
    } else {
        net.onConnect(() => note(`in ${net.room} as ${net.me} with ${net.players.join(',')}`));
        net.onDisconnect((reason) => note(`out: ${reason}`));
        net.onMessage<{ from: string; text: string }>('said', ({ from, text }) => note(`${from} said ${text}`));
        connectAs(net);
    }
    return createScene();
};

/** Runs every game and the room one step, then lets the line carry what they sent. */
const pump = async (times = 1) => {
    for (let i = 0; i < times; i++) {
        await settle();
        for (const game of games) game.run(1);
        for (const name of server?.rooms ?? []) server!.room(name)!.step(1);
    }
};

const start = (log: TLog, options: Partial<TServerOptions> = {}, connect: (net: TNetHandle, i: number) => void = (net) => net.connect(connectLoopback(server!), { room: 'lobby' })) => {
    let made = 0;
    let last: TNetHandle | null = null;
    const scene = (n: number) => makeLobby(log, (net) => {
        last = net;
        connect(net, n);
    });
    server = createServer({ width: 160, height: 90, scenes: { Lobby: makeLobby(log, () => {}) }, clock: false, ...options });
    const player = () => {
        const n = made++;
        const game = createHeadlessGame({ width: 160, height: 90, scenes: { Lobby: scene(n) } });
        games.push(game);
        if (last !== null) handles.set(game, last);
        return game;
    };
    return { player };
};

const said = (log: TLog, role: string, me?: string | null) => log.filter((entry) => entry.role === role && (me === undefined || entry.me === me)).map((entry) => entry.what);

describe('nacatamalon/net', () => {
    it('lets players into a room, tells each who is there, and carries what they say through the server', async () => {
        const log: TLog = [];
        const { player } = start(log);
        const ana = player();
        await pump(3);
        player();
        await pump(3);

        expect(server!.rooms).toEqual(['lobby']);
        expect(server!.room('lobby')!.players).toEqual(['player-1', 'player-2']);
        expect(said(log, 'server')).toEqual(['join player-1', 'join player-2']);
        // The first heard itself arrive, then the second; the second, both at once.
        expect(said(log, 'client', 'player-1')).toEqual(['in lobby as player-1 with player-1', 'join player-1', 'join player-2']);
        expect(said(log, 'client', 'player-2')).toEqual(['in lobby as player-2 with player-1,player-2', 'join player-1', 'join player-2']);

        // The first player's scene says something; the server hears it and tells everyone.
        log.length = 0;
        // A message sent from outside a scene's frame, the way a button's handler would.
        sendFrom(ana, 'say', 'hola');
        await pump(4);
        expect(said(log, 'server')).toEqual(['heard player-1: hola']);
        expect(said(log, 'client', 'player-1')).toEqual(['player-1 said hola']);
        expect(said(log, 'client', 'player-2')).toEqual(['player-1 said hola']);
    });

    it('tells the others when a player goes, and ends the room when the last one does', async () => {
        const log: TLog = [];
        const { player } = start(log);
        const ana = player();
        player();
        await pump(4);
        log.length = 0;

        ana.destroy();
        games.splice(games.indexOf(ana), 1);
        await pump(3);
        expect(said(log, 'server')).toEqual(['leave player-1']);
        expect(said(log, 'client', 'player-2')).toEqual(['leave player-1']);

        games.splice(0).forEach((game) => game.destroy());
        await pump(2);
        expect(server!.rooms).toEqual([]);
    });

    it('asks admit, gives the name it chooses, and refuses whom it refuses', async () => {
        const log: TLog = [];
        const { player } = start(log, { admit: ({ token }) => (token === 'ok-ana' ? 'ana' : false) }, (net, i) => {
            net.connect(connectLoopback(server!), { room: 'lobby', token: i === 0 ? 'ok-ana' : 'nope' });
        });
        player();
        player();
        await pump(4);
        expect(server!.room('lobby')!.players).toEqual(['ana']);
        expect(said(log, 'client', 'ana')[0]).toBe('in lobby as ana with ana');
        expect(said(log, 'client', null)).toEqual(['out: not let in']);
    });

    it('refuses a room with no scene, and runs each room\'s own scene', async () => {
        const log: TLog = [];
        const { player } = start(log, { roomScene: (room) => (room === 'lobby' ? 'Lobby' : null) }, (net, i) => {
            net.connect(connectLoopback(server!), { room: i === 0 ? 'lobby' : 'nowhere' });
        });
        player();
        player();
        await pump(4);
        expect(server!.rooms).toEqual(['lobby']);
        expect(said(log, 'client', null)).toEqual(["out: there is no room 'nowhere'"]);
    });

    it('sends a player out with kick, and they hear why', async () => {
        const log: TLog = [];
        const { player } = start(log);
        player();
        await pump(3);
        kickFrom(server!, 'player-1', 'too loud');
        await pump(3);
        expect(said(log, 'client', null)).toContain('out: too loud');
        expect(said(log, 'server')).toContain('leave player-1');
    });

    it('a second connection under the same name takes over and the first goes', async () => {
        const log: TLog = [];
        const { player } = start(log, { admit: () => 'ana' });
        player();
        await pump(3);
        player();
        await pump(4);
        expect(server!.room('lobby')!.players).toEqual(['ana']);
        expect(said(log, 'client', null)).toContain('out: connected from somewhere else');
    });

    it('says what only one side can do, and what JSON cannot carry', () => {
        const errors: string[] = [];
        const room = createRoom({
            width: 160, height: 90, clock: false,
            scenes: {
                Lobby: () => {
                    const net = useNet();
                    try { net.send('say', 'x'); } catch (error) { errors.push((error as Error).message); }
                    try { net.connect('ws://x'); } catch (error) { errors.push((error as Error).message); }
                    return createScene();
                },
            },
        });
        room.destroy();
        expect(errors[0]).toContain('useNet().send: this scene runs in a room of the server');
        expect(errors[1]).toContain('useNet().connect: this scene runs in a room of the server');

        const client = createHeadlessGame({
            width: 160, height: 90,
            scenes: {
                Lobby: () => {
                    const net = useNet();
                    try { net.broadcast('x'); } catch (error) { errors.push((error as Error).message); }
                    try { net.send('say', 'x'); } catch (error) { errors.push((error as Error).message); }
                    return createScene();
                },
            },
        });
        client.destroy();
        expect(errors[2]).toContain('useNet().broadcast: this scene runs in a player\'s game');
        expect(errors[3]).toContain("useNet().send: 'say' was sent with no server");
    });

    it('works over a real WebSocket, with the server listening on a port in Bun', async () => {
        const log: TLog = [];
        const port = 20000 + Math.floor(Math.random() * 20000);
        const { player } = start(log, {}, (net) => net.connect(`ws://127.0.0.1:${port}`, { room: 'lobby' }));
        server!.listen(port);
        const ana = player();
        for (let i = 0; i < 40 && said(log, 'client').length < 2; i++) {
            await new Promise((done) => setTimeout(done, 10));
            await pump(1);
        }
        expect(said(log, 'client', 'player-1')).toEqual(['in lobby as player-1 with player-1', 'join player-1']);
        sendFrom(ana, 'say', 'por el cable');
        for (let i = 0; i < 40 && !said(log, 'client', 'player-1').includes('player-1 said por el cable'); i++) {
            await new Promise((done) => setTimeout(done, 10));
            await pump(1);
        }
        expect(said(log, 'server')).toContain('heard player-1: por el cable');
        expect(said(log, 'client', 'player-1')).toContain('player-1 said por el cable');
    });

    it('refuses a player who sends too much while it waits to be let in', async () => {
        const log: TLog = [];
        // An account check that never answers.
        start(log, { admit: () => new Promise<boolean>(() => {}) });
        const line = connectLoopback(server!);
        let reason = '';
        line.onMessage((text) => {
            const wire = JSON.parse(text) as { k: string; reason?: string };
            if (wire.k === 'bye') reason = wire.reason ?? '';
        });
        line.onClose(() => {});
        line.send(JSON.stringify({ k: 'hello', v: 1, room: 'lobby', token: 'x' }));
        for (let i = 0; i < 100; i++) line.send(JSON.stringify({ k: 'msg', t: 'say', d: 'a'.repeat(100) }));
        await settle();
        await settle();
        expect(reason).toBe('it sent too much before being let in');
        expect(server!.rooms).toEqual([]);
    });

    it('a room whose scene sends its last player out finishes its step before it ends', async () => {
        let ended = false;
        let updatesAfterEnd = 0;
        const heard: string[] = [];
        const Lobby: TSceneFn = () => {
            const net = useNet();
            if (net.role === 'server') {
                net.onMessage('quit', (_data, from) => {
                    net.kick(from!, 'asked to go');
                    heard.push('kicked');
                });
                net.onLeave((player) => {
                    heard.push(`leave ${player}`);
                    ended = true;
                });
                useUpdate(() => {
                    if (ended) updatesAfterEnd += 1;
                });
            } else {
                net.onConnect(() => net.send('quit'));
                net.connect(connectLoopback(server!), { room: 'lobby' });
            }
            return createScene();
        };
        server = createServer({ width: 16, height: 9, scenes: { Lobby }, clock: false });
        games.push(createHeadlessGame({ width: 16, height: 9, scenes: { Lobby } }));
        await pump(6);
        // The kick returned before the room was looked at; its scene heard the player leave as it ended.
        expect(heard).toEqual(['kicked', 'leave player-1']);
        expect(updatesAfterEnd).toBe(0);
        expect(server.rooms).toEqual([]);
    });

    it('a message answered in the step the line goes is lost, not thrown', async () => {
        let thrown: unknown = null;
        const Lobby: TSceneFn = () => {
            const net = useNet();
            if (net.role === 'server') {
                net.onJoin((player) => {
                    net.sendTo(player, 'ping');
                    net.kick(player, 'bye now');
                });
            } else {
                net.onMessage('ping', () => {
                    try {
                        if (net.status === 'online') net.send('pong');
                    } catch (error) {
                        thrown = error;
                    }
                });
                net.connect(connectLoopback(server!), { room: 'lobby' });
            }
            return createScene();
        };
        server = createServer({ width: 16, height: 9, scenes: { Lobby }, clock: false });
        games.push(createHeadlessGame({ width: 16, height: 9, scenes: { Lobby } }));
        await pump(6);
        expect(thrown).toBeNull();
    });

    it('a room that cannot start refuses the player, and the server goes on', async () => {
        const reasons: string[] = [];
        const error = console.error;
        console.error = () => {};
        try {
            const Lobby: TSceneFn = () => {
                const net = useNet();
                if (net.role === 'server') throw new Error('this room is broken');
                net.onDisconnect((reason) => reasons.push(reason));
                net.connect(connectLoopback(server!), { room: 'lobby' });
                return createScene();
            };
            server = createServer({ width: 16, height: 9, scenes: { Lobby }, clock: false });
            games.push(createHeadlessGame({ width: 16, height: 9, scenes: { Lobby } }));
            await pump(4);
        } finally {
            console.error = error;
        }
        expect(reasons).toEqual(["room 'lobby' could not start"]);
        expect(server!.rooms).toEqual([]);
    });

    it('hands over nothing in the middle of a frame: what arrives waits for the next step', async () => {
        const log: TLog = [];
        const { player } = start(log);
        player();
        // The welcome is on its way and has arrived, but no step has run in the player's game yet.
        await settle();
        server!.room('lobby')?.step(1);
        await settle();
        expect(said(log, 'client')).toEqual([]);
        await pump(1);
        expect(said(log, 'client')[0]).toBe('in lobby as player-1 with player-1');
    });
});

/**
 * Sends from a player's game as its scene would, through a handle made in that game.
 */
const sendFrom = (game: THeadlessGame, type: string, data: unknown) => {
    const handle = handles.get(game);
    if (handle === undefined) throw new Error('no handle');
    handle.send(type, data);
};

const kickFrom = (target: TServer, player: string, reason: string) => {
    target.room('lobby')!.leave(player, reason);
};

/** The handle each player's scene made, kept by the scene for the test to send through. */
const handles = new Map<THeadlessGame, TNetHandle>();
