import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene, useReady, useScene, useSpawn, useUpdate } from '../src';
import { createHeadlessGame } from '../src/headless';
import { connectLoopback, createRoom, createRoomStore, createServer, useNet, useNetSpawn, useRoomStore, useShared } from '../src/net';
import { fade } from '../src/transition';
import type { THeadlessGame } from '../src/headless';
import type { TNetConnection, TNetHandle, TRoom, TServer, TServerOptions, TShared } from '../src/net';
import type { TSceneFn } from '../src';

/**
 * Moving to another room on the same line (`useNet().joinRoom`): the server asks `admit`, lets the
 * room the player leaves go of it only once the new one takes it, and the player goes from the scene
 * of its room to the scene of the new one, seeing it whole at its `onConnect`.
 */

const settle = () => new Promise((done) => setTimeout(done, 5));

let server: TServer | null = null;
const games: THeadlessGame[] = [];
const rooms: TRoom[] = [];

afterEach(() => {
    for (const game of games.splice(0)) {
        try {
            game.destroy();
        } catch {
            // Already ended by the test.
        }
    }
    for (const room of rooms.splice(0)) room.destroy();
    server?.close();
    server = null;
});

const count = createRoomStore({ key: 'count', state: { visits: 0, place: '' } });

/** What each player's game saw, in order, by name of the scene that saw it. */
let log: string[] = [];
/** The door of the last place a player's game built. */
let lastDoor: TShared<{ place: string; opened: number }> | null = null;
/** The room store of the last place a player's game built. */
let lastCount: { ready: boolean; state: { place: string } } | null = null;

type TSceneHooks = {
    /** The server's room, in the scene's body. */
    server?: (net: TNetHandle, place: string) => void;
    /** A player's game, in the scene's body. */
    client?: (net: TNetHandle, place: string) => void;
};

/**
 * A place of the game: a door every game builds (`key: 'door'`, the same in every place), a store
 * the room counts its visitors in, and what the test adds.
 */
const place = (name: string, hooks: TSceneHooks = {}, scene: () => void = () => {}): TSceneFn => () => {
    const net = useNet();
    const visits = useRoomStore(count);
    const door = useShared({ key: 'door', fields: { place: name, opened: 0 } });
    scene();
    if (net.role === 'server') {
        visits.set((s) => { s.place = name; });
        net.onJoin(() => {
            visits.set((s) => { s.visits += 1; });
            door.fields.opened += 1;
        });
        hooks.server?.(net, name);
        return createScene();
    }
    lastDoor = door;
    let first = true;
    useUpdate(() => {
        if (!first) return;
        first = false;
        log.push(`${name}: first update ${net.status} in '${net.room}'`);
    });
    lastCount = visits;
    net.onConnect(() => log.push(`${name}: connect '${net.room}' as ${net.me}, store of '${visits.state.place}' ready ${visits.ready}`));
    net.onDisconnect((reason) => log.push(`${name}: disconnect ${reason}`));
    net.onLeave((who) => log.push(`${name}: leave ${who}`));
    hooks.client?.(net, name);
    return createScene();
};

/** Runs a game a step at a time, the rooms with it, until a step throws: what it threw. */
const runUntilThrows = async (game: THeadlessGame): Promise<string> => {
    for (let i = 0; i < 20; i++) {
        await settle();
        try {
            game.run(1);
        } catch (error) {
            return (error as Error).message;
        }
        for (const name of server?.rooms ?? []) server!.room(name)!.step(1);
    }
    return 'nothing threw';
};

const pump = async (times = 1) => {
    for (let i = 0; i < times; i++) {
        await settle();
        for (const game of games) game.run(1);
        for (const name of server?.rooms ?? []) server!.room(name)!.step(1);
    }
};

const roomScene = (room: string): string | null => {
    if (room === 'lobby') return 'Lobby';
    if (room === 'pool' || room === 'pool-2') return 'Pool';
    if (room === 'lobby-2') return 'Lobby';
    if (room === 'broken') return 'Broken';
    if (room === 'attic') return 'Attic';
    return null;
};

type TStart = {
    server?: TSceneHooks;
    client?: TSceneHooks;
    options?: Partial<TServerOptions>;
    /** Scenes the players' games have that the server's rooms do not run, or run differently. */
    clientScenes?: Record<string, TSceneFn>;
};

const start = (given: TStart = {}) => {
    log = [];
    const serverScenes = { Lobby: place('Lobby', given.server), Pool: place('Pool', given.server), Broken: place('Broken', given.server), Attic: place('Attic', given.server) };
    server = createServer({ width: 160, height: 90, scenes: serverScenes, clock: false, step: 60, roomScene, ...given.options });
    /** A player's game in the lobby; its scenes' handles kept as they are built. */
    const player = (room = 'lobby', options: { token?: string; initialScene?: string } = {}) => {
        const nets: TNetHandle[] = [];
        let connected = false;
        const hooks: TSceneHooks = {
            client: (net, name) => {
                nets.push(net);
                given.client?.client?.(net, name);
                if (!connected) {
                    connected = true;
                    net.connect(connectLoopback(server!), { room, ...(options.token === undefined ? {} : { token: options.token }) });
                }
            },
        };
        const game = createHeadlessGame({
            width: 160,
            height: 90,
            ...(options.initialScene === undefined ? {} : { initialScene: options.initialScene }),
            scenes: { Lobby: place('Lobby', hooks), Pool: place('Pool', hooks), Attic: place('Attic', hooks), ...given.clientScenes },
        });
        games.push(game);
        return { game, net: () => nets.at(-1)!, scenes: () => [...game.scenes] };
    };
    return { player };
};

describe('nacatamalon/net: joinRoom', () => {
    it('moves a player to another room and its scene on the same line, seeing it whole at onConnect', async () => {
        const { player } = start();
        const ana = player();
        await pump(4);
        expect(ana.net().room).toBe('lobby');
        log = [];

        let kept = false;
        void ana.net().joinRoom('pool').then(() => { kept = true; });
        await pump(4);

        expect(ana.net().room).toBe('pool');
        expect(ana.net().status).toBe('online');
        expect(ana.net().players).toEqual([ana.net().me!]);
        expect(kept).toBe(true);
        expect(log).toEqual([
            `Lobby: leave player-1`,
            `Pool: connect 'pool' as player-1, store of 'Pool' ready true`,
            `Pool: first update online in 'pool'`,
        ]);
        expect(server!.rooms).toEqual(['pool']);
    });

    it('lets the room it leaves hear it go, the room it reaches hear it come, and nobody hear a disconnect', async () => {
        const heard: string[] = [];
        const { player } = start({
            server: { server: (net, name) => {
                net.onJoin((who) => heard.push(`${name} join ${who}`));
                net.onLeave((who) => heard.push(`${name} leave ${who}`));
            } },
        });
        const ana = player();
        const ben = player();
        await pump(4);
        heard.length = 0;
        void ana.net().joinRoom('pool');
        await pump(4);
        expect(heard).toEqual(['Lobby leave player-1', 'Pool join player-1']);
        expect(log.some((line) => line.includes('disconnect'))).toBe(false);
        expect(server!.room('lobby')!.players).toEqual(['player-2']);
        expect(ben.net().players).toEqual(['player-2']);
    });

    it('builds the new scene\'s door though the old one had one with the same key, and in the same scene again', async () => {
        const { player } = start();
        const ana = player();
        await pump(4);
        void ana.net().joinRoom('pool');
        await pump(4);
        expect(ana.scenes()).toEqual(['Pool']);
        // Same scene in both rooms: restarted, its door again.
        void ana.net().joinRoom('pool-2');
        await pump(4);
        expect(ana.net().room).toBe('pool-2');
        expect(ana.net().status).toBe('online');
        expect(log.filter((line) => line.includes('connect')).at(-1)).toBe(`Pool: connect 'pool-2' as player-1, store of 'Pool' ready true`);
    });

    it('goes under a transition, the new scene updating only once it is in its room', async () => {
        const { player } = start();
        const ana = player();
        await pump(4);
        log = [];
        let kept = false;
        void ana.net().joinRoom('pool', { transition: fade(0.1) }).then(() => { kept = true; });
        for (let i = 0; i < 30 && !kept; i++) await pump(1);
        expect(kept).toBe(true);
        await pump(10);
        expect(ana.scenes()).toEqual(['Pool']);
        expect(log.filter((line) => line.startsWith('Pool:'))).toEqual([
            `Pool: connect 'pool' as player-1, store of 'Pool' ready true`,
            `Pool: first update online in 'pool'`,
        ]);
    });

    it('stays where it was, as it was, when admit says no, and what it sends still arrives', async () => {
        const said: string[] = [];
        const { player } = start({
            options: { admit: ({ from }) => from === undefined },
            server: { server: (net, name) => net.onMessage('hi', (_data, from) => said.push(`${name} ${from}`)) },
        });
        const ana = player();
        await pump(4);
        let reason = '';
        ana.net().joinRoom('pool').catch((error: Error) => { reason = error.message; });
        await pump(4);
        expect(reason).toContain("did not take the player, who stays in room 'lobby' (not let in)");
        expect(ana.net().room).toBe('lobby');
        expect(ana.net().status).toBe('online');
        expect(ana.scenes()).toEqual(['Lobby']);
        expect(server!.rooms).toEqual(['lobby']);
        ana.net().send('hi');
        await pump(3);
        expect(said).toEqual(['Lobby player-1']);
    });

    it('stays when there is no such room, and when the room cannot start on the server', async () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        const { player } = start({ server: { server: (_net, name) => { if (name === 'Broken') throw new Error('broken'); } } });
        const ana = player();
        await pump(4);
        const reasons: string[] = [];
        ana.net().joinRoom('nowhere').catch((e: Error) => reasons.push(e.message));
        await pump(3);
        ana.net().joinRoom('broken').catch((e: Error) => reasons.push(e.message));
        await pump(3);
        error.mockRestore();
        expect(reasons[0]).toContain("(there is no room 'nowhere')");
        expect(reasons[1]).toContain("(room 'broken' could not start)");
        expect(ana.net().room).toBe('lobby');
        expect(server!.rooms).toEqual(['lobby']);
    });

    it('throws when not in a room and while moving; to the room it is in it is kept at once', async () => {
        const { player } = start({ clientScenes: { Menu: () => createScene() } });
        const ana = player();
        expect(() => ana.net().joinRoom('pool')).toThrow("the game is not in a room (it is 'connecting')");
        await pump(4);
        await ana.net().joinRoom('lobby');
        void ana.net().joinRoom('pool');
        expect(() => ana.net().joinRoom('attic')).toThrow("while the player is still moving to room 'pool'");
        await pump(4);
        expect(ana.net().room).toBe('pool');
    });

    it('throws in a game that came in from a menu and never went to its room\'s scene, and the line stays', async () => {
        log = [];
        server = createServer({ width: 160, height: 90, scenes: { Lobby: place('Lobby'), Pool: place('Pool') }, clock: false, step: 60, roomScene });
        let net: TNetHandle | null = null;
        const game = createHeadlessGame({
            width: 160, height: 90,
            scenes: {
                Menu: () => {
                    net = useNet();
                    net.connect(connectLoopback(server!), { room: 'lobby' });
                    return createScene();
                },
                Lobby: place('Lobby'),
                Pool: place('Pool'),
            },
        });
        games.push(game);
        await pump(4);
        expect(net!.status).toBe('online');
        expect(() => net!.joinRoom('pool')).toThrow("room 'lobby' runs 'Lobby', which is not running");
        expect(net!.status).toBe('online');
    });

    it('drops what the player says between being moved and being there', async () => {
        const said: string[] = [];
        const { player } = start({ server: { server: (net, name) => net.onMessage('hi', (data) => said.push(`${name} ${String(data)}`)) } });
        const ana = player();
        await pump(4);
        void ana.net().joinRoom('pool');
        // Moved on the server, and this game not there yet: sent on the raw line, as it was.
        await settle();
        ana.net().send('hi', 'too soon');
        await pump(4);
        ana.net().send('hi', 'there');
        await pump(3);
        expect(said).toEqual(['Pool there']);
    });

    it('tells a HUD launched beside it the old players leave, and the new room connect, its key filled by the new room', async () => {
        const huds: string[] = [];
        let score: TShared<Record<string, unknown>> | null = null;
        const Hud: TSceneFn = () => {
            const net = useNet();
            score = useShared({ key: 'score', fields: { goals: 0 } });
            net.onLeave((who) => huds.push(`leave ${who}`));
            net.onConnect(() => huds.push(`connect ${net.room} ${JSON.stringify(score!.fields)}`));
            net.onJoin((who) => huds.push(`join ${who}`));
            return createScene();
        };
        const ServerHud: TSceneFn = () => {
            const shared = useShared({ key: 'score', fields: { goals: 0 } as Record<string, unknown> });
            if (useNet().room === 'lobby') shared.fields.winner = 'ana';
            else shared.fields.goals = 3;
            return createScene();
        };
        log = [];
        server = createServer({
            width: 160, height: 90, clock: false, step: 60, roomScene,
            scenes: {
                Lobby: () => { useScene().launch('Hud'); return place('Lobby')({}); },
                Pool: () => { useScene().launch('Hud'); return place('Pool')({}); },
                Attic: place('Attic'),
                Hud: ServerHud,
            },
        });
        let net: TNetHandle | null = null;
        let launched = false;
        const game = createHeadlessGame({
            width: 160, height: 90,
            scenes: {
                Lobby: place('Lobby', { client: (n) => {
                    net = n;
                    if (!launched) {
                        launched = true;
                        useScene().launch('Hud');
                        n.connect(connectLoopback(server!), { room: 'lobby' });
                    }
                } }),
                Pool: place('Pool', { client: (n) => { net = n; } }),
                Attic: place('Attic', { client: (n) => { net = n; } }),
                Hud,
            },
        });
        games.push(game);
        await pump(4);
        expect(score!.fields).toEqual({ goals: 0, winner: 'ana' });
        huds.length = 0;
        void net!.joinRoom('pool');
        await pump(4);
        expect(huds).toEqual(['leave player-1', 'connect pool {"goals":3}', 'join player-1']);
        // A room with no score: the HUD's goes back to how it was built.
        void net!.joinRoom('attic');
        await pump(4);
        expect(net!.room).toBe('attic');
        expect(score!.fields).toEqual({ goals: 0 });
    });

    it('takes the room\'s stores out of ready while moving, and back with the new room\'s', async () => {
        const seen: string[] = [];
        const { player } = start({
            client: { client: (net, name) => net.onLeave(() => seen.push(`${name} leave: ready ${lastCount!.ready}, '${lastCount!.state.place}'`)) },
        });
        const ana = player();
        await pump(4);
        void ana.net().joinRoom('pool');
        await pump(4);
        // While leaving, the old room's values, not ready; at its onConnect, the new room's.
        expect(seen).toEqual(["Lobby leave: ready false, 'Lobby'"]);
        expect(log).toContain("Pool: connect 'pool' as player-1, store of 'Pool' ready true");
    });

    it('closes the line, saying why, when the game has no scene for the new room', async () => {
        const { player } = start();
        const ana = player();
        await pump(4);
        let reason = '';
        ana.net().joinRoom('broken').catch((e: Error) => { reason = e.message; });
        await pump(4);
        expect(ana.net().status).toBe('closed');
        expect(log).toContain("Lobby: disconnect the game has no scene 'Broken' for room 'broken'");
        expect(reason).toContain("the line closed before the player was in room 'broken'");
        expect(ana.scenes()).toEqual(['Lobby']);
    });

    it('closes the line when the new scene throws, and the old one, still running, connects again whole', async () => {
        const { player } = start({ clientScenes: { Attic: () => { throw new Error('the attic is locked'); } } });
        const ana = player();
        await pump(4);
        const error = spyOn(console, 'error').mockImplementation(() => {});
        let reason = '';
        ana.net().joinRoom('attic').catch((e: Error) => { reason = e.message; });
        expect(await runUntilThrows(ana.game)).toContain('the attic is locked');
        error.mockRestore();
        await pump(3);
        expect(ana.net().status).toBe('closed');
        expect(reason).toContain("the line closed before the player was in room 'attic' (scene 'Attic' did not start)");
        expect(ana.scenes()).toEqual(['Lobby']);
        // Back in the lobby from the scene that stayed: its door is shared again, and fills with the
        // room's (the lobby, made again, counts one coming in).
        const door = lastDoor!;
        door.fields.opened = -1;
        log = [];
        ana.net().connect(connectLoopback(server!), { room: 'lobby' });
        await pump(20);
        expect(ana.net().status).toBe('online');
        expect(log).toContain("Lobby: connect 'lobby' as player-1, store of 'Lobby' ready true");
        expect(door.fields.opened).toBe(1);
    });

    it('lets the old scene connect again whole when the line goes before the change starts', async () => {
        let door: TShared<{ place: string; opened: number }> | null = null;
        let scene: ReturnType<typeof useScene> | null = null;
        let net: TNetHandle | null = null;
        log = [];
        const Lobby: TSceneFn = () => {
            const shared = useShared({ key: 'door', fields: { place: 'Lobby', opened: 0 } });
            if (useNet().role === 'server') useNet().onJoin(() => { shared.fields.opened += 1; });
            return createScene();
        };
        server = createServer({ width: 160, height: 90, scenes: { Lobby, Pool: place('Pool') }, clock: false, step: 60, roomScene });
        const game = createHeadlessGame({
            width: 160, height: 90,
            scenes: {
                Lobby: () => {
                    net = useNet();
                    scene = useScene();
                    door = useShared({ key: 'door', fields: { place: 'Lobby', opened: 0 } });
                    if (net.status === 'offline') net.connect(connectLoopback(server!), { room: 'lobby' });
                    return createScene();
                },
                Pool: place('Pool'),
                Cover: () => createScene(),
            },
        });
        games.push(game);
        // Someone else in the lobby, so it stays.
        const ben = createHeadlessGame({ width: 160, height: 90, scenes: { Lobby: () => { useNet().connect(connectLoopback(server!), { room: 'lobby' }); return createScene(); } } });
        games.push(ben);
        // Fields are shown a moment after the server says them.
        await pump(20);
        expect(door!.fields.opened).toBe(2);
        // Something else is being covered, so the change waits; meanwhile the line goes.
        scene!.launch('Cover', { transition: fade(2) });
        let reason = '';
        net!.joinRoom('pool').catch((e: Error) => { reason = e.message; });
        await pump(3);
        expect(net!.room).toBe('pool');
        expect(game.scenes).toEqual(['Lobby', 'Cover']);
        net!.disconnect();
        await pump(2);
        expect(reason).toContain("the line closed before the player was in room 'pool' (left)");
        net!.connect(connectLoopback(server!), { room: 'lobby' });
        await pump(20);
        expect(net!.status).toBe('online');
        expect(door!.fields.opened).toBe(3);
    });

    it('can be chained from the new room\'s onConnect, under a transition', async () => {
        let chained = false;
        const { player } = start({
            client: { client: (net, name) => {
                if (name === 'Pool') net.onConnect(() => {
                    if (chained) return;
                    chained = true;
                    void net.joinRoom('attic', { transition: fade(0.1) });
                });
            } },
        });
        const ana = player();
        await pump(4);
        void ana.net().joinRoom('pool', { transition: fade(0.1) });
        for (let i = 0; i < 60 && ana.net().room !== 'attic'; i++) await pump(1);
        for (let i = 0; i < 30 && ana.scenes()[0] !== 'Attic'; i++) await pump(1);
        await pump(10);
        expect(ana.net().room).toBe('attic');
        expect(ana.net().status).toBe('online');
        expect(ana.scenes()).toEqual(['Attic']);
    });

    it('is kept in the scene that took the new one\'s place from its useReady', async () => {
        const { player } = start({
            clientScenes: {
                Pool: () => {
                    const scene = useScene();
                    useReady(() => scene.change('Attic'));
                    return createScene();
                },
            },
        });
        const ana = player();
        await pump(4);
        let kept = false;
        void ana.net().joinRoom('pool').then(() => { kept = true; });
        await pump(4);
        expect(kept).toBe(true);
        expect(ana.scenes()).toEqual(['Attic']);
        expect(ana.net().status).toBe('online');
    });

    it('gives admit where the player comes from, keeps the token it connected with, and a new one only if it moves', async () => {
        const asked: string[] = [];
        const { player } = start({
            options: {
                admit: ({ room, token, from }) => {
                    asked.push(`${room} ${token} ${from === undefined ? '-' : `${from.room}/${from.player}`}`);
                    return token === 'ana' ? 'ana' : false;
                },
            },
        });
        const ana = player('lobby', { token: 'ana' });
        await pump(4);
        expect(ana.net().me).toBe('ana');
        void ana.net().joinRoom('pool');
        await pump(4);
        ana.net().joinRoom('attic', { token: 'nobody' }).catch(() => {});
        await pump(4);
        void ana.net().joinRoom('lobby-2');
        await pump(4);
        expect(asked).toEqual(['lobby ana -', 'pool ana lobby/ana', 'attic nobody pool/ana', 'lobby-2 ana pool/ana']);
        expect(ana.net().room).toBe('lobby-2');
    });

    it('does not carry a name the room gave to the next room', async () => {
        const { player } = start();
        const ana = player();
        const ben = player('pool');
        await pump(4);
        expect(ana.net().me).toBe('player-1');
        expect(ben.net().me).toBe('player-1');
        void ana.net().joinRoom('pool');
        await pump(4);
        expect(ana.net().me).toBe('player-2');
        expect(server!.room('pool')!.players).toEqual(['player-1', 'player-2']);
    });

    it('sends out whoever had the name admit gives in the new room, and keeps the one who came', async () => {
        const { player } = start({ options: { admit: ({ token }) => token ?? false } });
        const ana = player('lobby', { token: 'ana' });
        const other = player('pool', { token: 'ana' });
        await pump(4);
        void ana.net().joinRoom('pool');
        await pump(4);
        expect(ana.net().room).toBe('pool');
        expect(ana.net().status).toBe('online');
        expect(other.net().status).toBe('closed');
        expect(server!.room('pool')!.players).toEqual(['ana']);
    });

    it('moves no one when the room sends the player out while admit decides', async () => {
        let letIn: ((verdict: boolean) => void) | null = null;
        const { player } = start({
            options: {
                admit: ({ from }) => (from === undefined ? true : new Promise<boolean>((done) => { letIn = done; })),
            },
        });
        const ana = player();
        await pump(4);
        let reason = '';
        ana.net().joinRoom('pool').catch((e: Error) => { reason = e.message; });
        await pump(2);
        server!.room('lobby')!.leave('player-1', 'kicked');
        await pump(2);
        letIn!(true);
        await pump(3);
        expect(server!.room('pool')).toBeUndefined();
        expect(ana.net().status).toBe('closed');
        expect(reason).toContain('the line closed');
    });

    it('answers a second move on the line with stay, and a room of its own server with stay', async () => {
        server = createServer({ width: 160, height: 90, scenes: { Lobby: place('Lobby'), Pool: place('Pool') }, clock: false, step: 60, roomScene });
        const line: TNetConnection = connectLoopback(server);
        const heard: string[] = [];
        line.onMessage((text) => heard.push(String(text)));
        line.send(JSON.stringify({ k: 'hello', v: 2, room: 'lobby', token: null }));
        await settle();
        line.send(JSON.stringify({ k: 'go', room: 'pool', n: 1 }));
        line.send(JSON.stringify({ k: 'go', room: 'pool', n: 2 }));
        await settle();
        await settle();
        expect(heard.some((text) => text.includes('"k":"stay","n":2,"reason":"already moving"'))).toBe(true);
        expect(heard.some((text) => text.includes('"k":"welcome"') && text.includes('"n":1'))).toBe(true);

        const alone = createRoom({ width: 160, height: 90, scenes: { Lobby: () => createScene() }, clock: false });
        rooms.push(alone);
        const said: string[] = [];
        alone.join({ send: (text) => said.push(text), onMessage: (listener) => { setTimeout(() => listener(JSON.stringify({ k: 'go', room: 'pool', n: 7 })), 0); }, onClose: () => {}, close: () => {} });
        await settle();
        expect(said.some((text) => text.includes('"k":"stay","n":7,"reason":"this server does not move players between rooms"'))).toBe(true);
    });

    it('lets the new scene update only in its room, though the room arrives over several steps', async () => {
        log = [];
        server = createServer({ width: 160, height: 90, scenes: { Lobby: place('Lobby'), Pool: place('Pool') }, clock: false, step: 60, roomScene });
        // A line that hands over one message a step, once the move is asked for.
        const real = connectLoopback(server);
        const waiting: string[] = [];
        let slow = false;
        let hear: (text: string) => void = () => {};
        real.onMessage((text) => {
            if (slow) waiting.push(String(text));
            else hear(String(text));
        });
        const line: TNetConnection = { send: (text) => real.send(text), onMessage: (listener) => { hear = listener; }, onClose: (listener) => real.onClose(listener), close: (reason) => real.close(reason) };
        let net: TNetHandle | null = null;
        const game = createHeadlessGame({
            width: 160, height: 90,
            scenes: {
                Lobby: place('Lobby', { client: (n) => { net = n; if (n.status === 'offline') n.connect(line, { room: 'lobby' }); } }),
                Pool: place('Pool', { client: (n) => { net = n; } }),
            },
        });
        games.push(game);
        await pump(4);
        log = [];
        slow = true;
        void net!.joinRoom('pool');
        for (let i = 0; i < 20; i++) {
            await pump(1);
            const next = waiting.shift();
            if (next !== undefined) hear(next);
        }
        expect(net!.room).toBe('pool');
        expect(log).toEqual([
            'Lobby: leave player-1',
            "Pool: connect 'pool' as player-1, store of 'Pool' ready true",
            "Pool: first update online in 'pool'",
        ]);
    });

    it('lets go, in the player\'s own game, of what a listener sends as the old room\'s players leave', async () => {
        log = [];
        server = createServer({ width: 160, height: 90, scenes: { Lobby: place('Lobby'), Pool: place('Pool') }, clock: false, step: 60, roomScene });
        // The player's line, watched: what leaves the game, not what the server lets through.
        const real = connectLoopback(server);
        const sent: string[] = [];
        const line: TNetConnection = {
            send: (text) => {
                const wire = JSON.parse(text) as { k: string; t?: string };
                sent.push(wire.k === 'msg' ? `msg ${wire.t}` : wire.k);
                real.send(text);
            },
            onMessage: (l) => real.onMessage(l),
            onClose: (l) => real.onClose(l),
            close: (r) => real.close(r),
        };
        let net: TNetHandle | null = null;
        const game = createHeadlessGame({
            width: 160, height: 90,
            scenes: {
                Lobby: place('Lobby', { client: (n) => {
                    net = n;
                    n.onLeave(() => n.send('bye'));
                    if (n.status === 'offline') n.connect(line, { room: 'lobby' });
                } }),
                Pool: place('Pool', { client: (n) => { net = n; } }),
            },
        });
        games.push(game);
        await pump(4);
        sent.length = 0;
        void net!.joinRoom('pool');
        await pump(6);
        expect(net!.room).toBe('pool');
        expect(sent.filter((k) => k !== 'ping' && k !== 'in')).toEqual(['go', 'here']);
    });

    it('goes no further when a listener disconnects as the old room\'s players leave', async () => {
        const { player } = start({ client: { client: (net, name) => { if (name === 'Lobby') net.onLeave(() => net.disconnect()); } } });
        const ana = player();
        await pump(4);
        let reason = '';
        let kept = false;
        ana.net().joinRoom('pool').then(() => { kept = true; }, (e: Error) => { reason = e.message; });
        await pump(4);
        expect(kept).toBe(false);
        expect(reason).toContain("the line closed before the player was in room 'pool' (left)");
        expect(ana.scenes()).toEqual(['Lobby']);
        expect(ana.net().status).toBe('closed');
    });

    it('does not hand the room it left what the player said there, though another comes in under its name', async () => {
        const said: string[] = [];
        const { player } = start({
            options: { admit: ({ token }) => token ?? false },
            server: { server: (net, name) => net.onMessage('hi', (_data, from) => said.push(`${name} ${from}`)) },
        });
        const ana = player('lobby', { token: 'ana' });
        player('lobby', { token: 'bob' });
        await pump(4);
        // Said, and moved before the lobby's next step; then another tab comes in as Ana.
        ana.net().send('hi');
        void ana.net().joinRoom('pool');
        await settle();
        await settle();
        const tab = player('lobby', { token: 'ana' });
        tab.game.run(1);
        await settle();
        await settle();
        expect([...server!.room('lobby')!.players].sort()).toEqual(['ana', 'bob']);
        await pump(4);
        expect(said).toEqual([]);
    });

    it('throws from the scene of its room on its way out behind a transition', async () => {
        let scene: ReturnType<typeof useScene> | null = null;
        const { player } = start({ client: { client: (_net, name) => { if (name === 'Lobby') scene = useScene(); } }, clientScenes: { Menu: () => createScene() } });
        const ana = player();
        await pump(4);
        scene!.change('Menu', { transition: fade(1) });
        expect(() => ana.net().joinRoom('pool')).toThrow("runs 'Lobby', which is on its way out behind a transition");
    });

    it('hears why when the game ends with a move on its way', async () => {
        const { player } = start();
        const ana = player();
        await pump(4);
        let reason = '';
        const asked = ana.net().joinRoom('pool', { transition: fade(1) }).catch((e: Error) => { reason = e.message; });
        await pump(3);
        ana.game.destroy();
        await asked;
        expect(reason).toContain("did not get into room 'pool' (the game ended)");
    });

    it('follows a move the server answers with another number, its promise kept', async () => {
        log = [];
        server = createServer({ width: 160, height: 90, scenes: { Lobby: place('Lobby'), Pool: place('Pool') }, clock: false, step: 60, roomScene });
        const real = connectLoopback(server);
        const line: TNetConnection = {
            send: (text) => real.send(text),
            onMessage: (listener) => real.onMessage((text) => listener(String(text).replace('"n":1', '"n":99'))),
            onClose: (l) => real.onClose(l),
            close: (r) => real.close(r),
        };
        let net: TNetHandle | null = null;
        const game = createHeadlessGame({
            width: 160, height: 90,
            scenes: {
                Lobby: place('Lobby', { client: (n) => { net = n; if (n.status === 'offline') n.connect(line, { room: 'lobby' }); } }),
                Pool: place('Pool', { client: (n) => { net = n; } }),
            },
        });
        games.push(game);
        await pump(4);
        let kept = false;
        void net!.joinRoom('pool').then(() => { kept = true; });
        await pump(4);
        expect(game.scenes).toEqual(['Pool']);
        expect(kept).toBe(true);
    });

    it('stays when roomScene throws', async () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        const { player } = start({ options: { roomScene: (room) => { if (room === 'pool') throw new Error('no pools'); return 'Lobby'; } } });
        const ana = player();
        await pump(4);
        let reason = '';
        ana.net().joinRoom('pool').catch((e: Error) => { reason = e.message; });
        await pump(3);
        error.mockRestore();
        expect(reason).toContain("(room 'pool' could not start)");
        expect(ana.net().status).toBe('online');
    });

    it('goes lobby, pool, attic and back to the lobby, each time in the room\'s scene and seeing it whole', async () => {
        const { player } = start();
        const ana = player();
        await pump(4);
        for (const [room, scene] of [['pool', 'Pool'], ['attic', 'Attic'], ['lobby', 'Lobby']] as const) {
            log = [];
            await Promise.all([ana.net().joinRoom(room), pump(4)]);
            expect(ana.scenes()).toEqual([scene]);
            expect(log).toContain(`${scene}: connect '${room}' as player-1, store of '${scene}' ready true`);
            expect(server!.rooms).toEqual([room]);
        }
    });

    it('goes on to the new scene with no line when the line goes under the cover', async () => {
        const { player } = start();
        const ana = player();
        await pump(4);
        let reason = '';
        ana.net().joinRoom('pool', { transition: fade(0.5) }).catch((e: Error) => { reason = e.message; });
        await pump(3);
        expect(ana.scenes()).toEqual(['Lobby', 'Pool']);
        ana.net().disconnect();
        await pump(60);
        expect(reason).toContain("the line closed before the player was in room 'pool' (left)");
        expect(ana.scenes()).toEqual(['Pool']);
        expect(ana.net().status).toBe('closed');
    });

    it('closes the line when the new scene throws under a transition, the old one staying', async () => {
        const { player } = start({ clientScenes: { Attic: () => { throw new Error('the attic is locked'); } } });
        const ana = player();
        await pump(4);
        const error = spyOn(console, 'error').mockImplementation(() => {});
        let reason = '';
        ana.net().joinRoom('attic', { transition: fade(0.2) }).catch((e: Error) => { reason = e.message; });
        expect(await runUntilThrows(ana.game)).toContain('the attic is locked');
        error.mockRestore();
        await pump(30);
        expect(reason).toContain("(scene 'Attic' did not start)");
        expect(ana.scenes()).toEqual(['Lobby']);
    });

    it('closes the line when the new scene stops itself in its useReady', async () => {
        const { player } = start({ clientScenes: { Attic: () => { const scene = useScene(); useReady(() => scene.stop()); return createScene(); } } });
        const ana = player();
        await pump(4);
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        let reason = '';
        ana.net().joinRoom('attic').catch((e: Error) => { reason = e.message; });
        await pump(4);
        warn.mockRestore();
        expect(reason).toContain("(scene 'Attic' did not start)");
        expect(ana.net().status).toBe('closed');
    });

    it('can be chained from the promise', async () => {
        const { player } = start();
        const ana = player();
        await pump(4);
        void ana.net().joinRoom('pool', { transition: fade(0.1) }).then(() => ana.net().joinRoom('attic', { transition: fade(0.1) }));
        for (let i = 0; i < 80 && ana.scenes().join() !== 'Attic'; i++) await pump(1);
        expect(ana.net().room).toBe('attic');
        expect(ana.scenes()).toEqual(['Attic']);
    });

    it('moves no one, and leaves the other tab in, when another tab comes in with its name while admit decides', async () => {
        let letIn: ((verdict: string) => void) | null = null;
        const { player } = start({
            options: {
                admit: ({ token, from }) => (from === undefined ? token ?? false : new Promise<string>((done) => { letIn = done; })),
            },
        });
        const ana = player('lobby', { token: 'ana' });
        await pump(4);
        let reason = '';
        ana.net().joinRoom('pool').catch((e: Error) => { reason = e.message; });
        await pump(2);
        const tab = player('lobby', { token: 'ana' });
        await pump(3);
        letIn!('ana');
        await pump(3);
        expect(server!.room('pool')).toBeUndefined();
        expect(server!.room('lobby')!.players).toEqual(['ana']);
        expect(tab.net().status).toBe('online');
        expect(reason).toContain('the line closed');
    });

    it('keeps apart what the scene going out shares behind the cover, so it takes no key of the new one', async () => {
        let made = 0;
        const Late = () => { useShared({ key: 'door', fields: { place: 'late', opened: 0 } }); made += 1; };
        const { player } = start({
            client: { client: (net, name) => {
                if (name !== 'Lobby') return;
                const spawn = useSpawn(Late);
                useUpdate(() => { if (net.status === 'connecting' && made === 0 && net.room === 'pool') spawn(); });
            } },
        });
        const ana = player();
        await pump(4);
        let kept = false;
        void ana.net().joinRoom('pool', { transition: fade(0.2) }).then(() => { kept = true; });
        for (let i = 0; i < 40 && !kept; i++) await pump(1);
        expect(made).toBe(1);
        expect(kept).toBe(true);
        expect(ana.scenes()).toEqual(['Pool']);
    });

    it('destroys what the room it left made, and makes the new room\'s', async () => {
        const spawnedIn: string[] = [];
        const Coin = (where: string) => { spawnedIn.push(where); };
        const withCoins = (name: string): TSceneFn => place(name, {}, () => {
            const net = useNet();
            const spawn = useNetSpawn('coin', Coin);
            if (net.role === 'server') spawn(name);
        });
        log = [];
        server = createServer({ width: 160, height: 90, scenes: { Lobby: withCoins('Lobby'), Pool: withCoins('Pool') }, clock: false, step: 60, roomScene });
        let net: TNetHandle | null = null;
        const game = createHeadlessGame({
            width: 160, height: 90,
            scenes: {
                Lobby: () => {
                    const scene = withCoins('Lobby')({});
                    net = useNet();
                    if (net.status === 'offline') net.connect(connectLoopback(server!), { room: 'lobby' });
                    return scene;
                },
                Pool: () => { const scene = withCoins('Pool')({}); net = useNet(); return scene; },
            },
        });
        games.push(game);
        await pump(4);
        expect(game.findAll('Coin').length).toBe(1);
        expect(spawnedIn).toEqual(['Lobby', 'Lobby']);
        void net!.joinRoom('pool');
        await pump(4);
        // The lobby's gone, the pool's made here.
        expect(game.findAll('Coin').length).toBe(1);
        expect(spawnedIn).toEqual(['Lobby', 'Lobby', 'Pool', 'Pool']);
    });
});

