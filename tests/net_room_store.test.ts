import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene, useCleanup, useScene, useSpawn } from '../src';
import { createHeadlessGame } from '../src/headless';
import { connectLoopback, createRoom, createRoomStore, createServer, roomStoreOf, useNet, useRoomStore, useShared } from '../src/net';
import type { THeadlessGame } from '../src/headless';
import type { TNetConnection, TNetHandle, TRoom, TRoomStore, TServer, TServerOptions } from '../src/net';
import type { TSceneFn } from '../src';

/**
 * Room stores (`createRoomStore`): one per game, never shared between the rooms of a process; the
 * room's changed, every player's a read-only copy kept up to date, told before anything the room
 * says after the change; a player sees the room when `onConnect` is heard.
 */

const settle = () => new Promise((done) => setTimeout(done, 5));

let server: TServer | null = null;
const games: THeadlessGame[] = [];
const rooms: TRoom[] = [];

afterEach(() => {
    for (const game of games.splice(0)) game.destroy();
    for (const room of rooms.splice(0)) room.destroy();
    server?.close();
    server = null;
});

const score = createRoomStore({ key: 'score', state: { red: 0, blue: 0, phase: 'play' as string, history: [] as number[] } });
const secret = createRoomStore({ key: 'secret', state: { cheats: 0 }, serverOnly: true });

type TScore = TRoomStore<{ red: number; blue: number; phase: string; history: number[] }>;
type THooks = {
    server?: (net: TNetHandle, board: TScore) => void;
    client?: (net: TNetHandle, board: TScore) => void;
};

const makeMatch = (hooks: THooks): TSceneFn => () => {
    const net = useNet();
    const board = useRoomStore(score);
    if (net.role === 'server') hooks.server?.(net, board);
    else hooks.client?.(net, board);
    return createScene();
};

const pump = async (times = 1) => {
    for (let i = 0; i < times; i++) {
        await settle();
        for (const game of games) game.run(1);
        for (const name of server?.rooms ?? []) server!.room(name)!.step(1);
    }
};

const start = (hooks: THooks, options: Partial<TServerOptions> = {}) => {
    server = createServer({ width: 160, height: 90, scenes: { Match: makeMatch(hooks) }, clock: false, step: 60, ...options });
    /** A player's game, its scene's net and board handed back once it is built. */
    const player = (room = 'match', connect = true) => {
        let net: TNetHandle | null = null;
        let board: TScore | null = null;
        const game = createHeadlessGame({
            width: 160,
            height: 90,
            scenes: {
                Match: makeMatch({
                    ...hooks,
                    client: (n, b) => {
                        net = n;
                        board = b;
                        hooks.client?.(n, b);
                        if (connect) n.connect(connectLoopback(server!), { room });
                    },
                }),
                // The server's other scenes too, after it, so a player follows the room into them.
                ...Object.fromEntries(Object.entries(options.scenes ?? {}).filter(([scene]) => scene !== 'Match')),
            },
        });
        games.push(game);
        return { game, net: () => net!, board: () => board! };
    };
    return { player };
};

/** The room's own store of `score`. */
const roomBoard = (name = 'match') => server!.room(name)!.store(score);

describe('nacatamalon/net: room stores', () => {
    it('keeps each room\'s own, so a change in one never reaches another', async () => {
        const { player } = start({
            server: (net, board) => net.onMessage<'red' | 'blue'>('goal', (team) => board.set((s) => { s[team] += 1; })),
        });
        const ana = player('a');
        const ben = player('b');
        await pump(4);

        ana.net().send('goal', 'red');
        await pump(4);
        expect(roomBoard('a').state.red).toBe(1);
        expect(roomBoard('b').state.red).toBe(0);
        expect(ana.board().state.red).toBe(1);
        expect(ben.board().state.red).toBe(0);
    });

    it('tells the players what changed before what the room says after it', async () => {
        const heard: number[] = [];
        const { player } = start({
            server: (net, board) => net.onMessage<'red'>('goal', (team) => {
                board.set((s) => { s[team] += 1; });
                net.broadcast('scored', team);
            }),
            client: (net, board) => net.onMessage('scored', () => heard.push(board.state.red)),
        });
        const ana = player();
        await pump(4);
        ana.net().send('goal', 'red');
        await pump(3);
        ana.net().send('goal', 'red');
        await pump(3);
        expect(heard).toEqual([1, 2]);
    });

    it('gives a player who comes late the whole room, seen as soon as onConnect is heard and before the onJoins', async () => {
        const seen: string[] = [];
        const { player } = start({
            server: (net, board) => net.onMessage<'red'>('goal', (team) => board.set((s) => { s[team] += 1; s.history = [...s.history, 1]; })),
            client: (net, board) => {
                net.onConnect(() => seen.push(`${net.me}: connect ${net.status} ${board.ready} red ${board.state.red} history ${board.state.history.length}`));
                net.onJoin((who) => seen.push(`${net.me}: join ${who}`));
            },
        });
        const ana = player();
        await pump(4);
        ana.net().send('goal', 'red');
        await pump(3);
        seen.length = 0;

        const ben = player();
        expect(ben.net().status).toBe('connecting');
        expect(ben.board().ready).toBe(false);
        await pump(3);
        expect(seen.filter((line) => line.startsWith('player-2:'))).toEqual([
            'player-2: connect online true red 1 history 1',
            'player-2: join player-1',
            'player-2: join player-2',
        ]);
    });

    it('keeps what the room sent for a store nothing had asked for, for whoever asks later', async () => {
        const later: number[] = [];
        const Hud = () => {
            later.push(useRoomStore(score).state.red);
            return createScene();
        };
        let spawnHud: (() => unknown) | null = null;
        let net: TNetHandle | null = null;
        start({ server: (n, board) => n.onMessage<'red'>('goal', (team) => board.set((s) => { s[team] += 3; })) });
        // A page whose scene never asks for the store: only the piece it makes later does.
        const ana = createHeadlessGame({ width: 160, height: 90, scenes: { Match: () => {
            net = useNet();
            spawnHud = useSpawn(Hud);
            net.connect(connectLoopback(server!), { room: 'match' });
            return createScene();
        } } });
        games.push(ana);
        await pump(4);
        net!.send('goal', 'red');
        await pump(3);
        spawnHud!();
        expect(later).toEqual([3]);
    });

    it('lets a game that never connected change its own, and replaces it with the room\'s when it does', async () => {
        const { player } = start({
            server: (net, board) => net.onMessage<'blue'>('goal', (team) => board.set((s) => { s[team] += 1; })),
        });
        const ana = player();
        await pump(4);
        ana.net().send('goal', 'blue');
        await pump(3);

        const solo = player('match', false);
        await pump(1);
        expect(solo.board().writable).toBe(true);
        expect(solo.board().ready).toBe(true);
        solo.board().set((s) => { s.red = 9; });
        expect(solo.board().state.red).toBe(9);

        solo.net().connect(connectLoopback(server!), { room: 'match' });
        expect(solo.board().writable).toBe(false);
        expect(solo.board().state.red).toBe(9);
        await pump(4);
        expect(solo.board().state).toEqual({ red: 0, blue: 1, phase: 'play', history: [] });
    });

    it('never lets a player change it, nor anyone change it by hand', async () => {
        const { player } = start({});
        const ana = player();
        await pump(4);
        expect(ana.board().writable).toBe(false);
        expect(() => ana.board().set((s) => { s.red = 5; })).toThrow(/only reads it: the server decides/);
        expect(() => { (ana.board().state as { red: number }).red = 5; }).toThrow();
        expect(() => { (ana.board().state.history as number[]).push(1); }).toThrow();
        expect(() => { (roomBoard().state as { red: number }).red = 5; }).toThrow();
        expect(ana.board().state.red).toBe(0);
    });

    it('changes nothing when the change throws, and says where data that cannot travel is', async () => {
        const room = createRoom({ width: 160, height: 90, scenes: { Match: makeMatch({}) }, clock: false });
        rooms.push(room);
        const board = room.store(score);
        expect(() => board.set((s) => { s.red = 4; throw new Error('halfway'); })).toThrow('halfway');
        expect(board.state.red).toBe(0);
        expect(() => board.set((s) => { (s as { history: unknown[] }).history = [1, new Date()]; })).toThrow(/score\.history\[1\] is a Date/);
        expect(() => board.set((s) => { s.red = Number.NaN; })).toThrow(/score\.red is NaN/);
        expect(board.state).toEqual({ red: 0, blue: 0, phase: 'play', history: [] });
        expect(() => createRoomStore({ key: 'bad', state: { when: new Date() } })).toThrow(/bad\.when is a Date/);
    });

    it('keeps the object of what did not change, so watching an object is told only when it does', async () => {
        const room = createRoom({ width: 160, height: 90, scenes: { Match: makeMatch({}) }, clock: false });
        rooms.push(room);
        const board = room.store(score);
        const told: unknown[] = [];
        board.watch((s) => s.history, (history) => told.push(history));
        board.set((s) => { s.red += 1; });
        expect(told).toEqual([]);
        board.set((s) => { s.history.push(7); });
        expect(told).toEqual([[7]]);
    });

    it('never sends a serverOnly store, and will not give it to a player who connected', async () => {
        const texts: string[] = [];
        let asked: unknown = null;
        const Peek = () => {
            try {
                useRoomStore(secret);
            } catch (error) {
                asked = error;
            }
            return createScene();
        };
        const { player } = start({
            server: (net) => net.onMessage('cheat', () => server!.room('match')!.store(secret).set((s) => { s.cheats += 1; })),
        });
        const ana = player();
        await pump(4);
        const room = server!.room('match')!;
        const tap: TNetConnection = { send: (text) => texts.push(text), onMessage: () => {}, onClose: () => {}, close: () => {} };
        room.join(tap, 'watcher');
        ana.net().send('cheat');
        await pump(3);
        expect(room.store(secret).state.cheats).toBe(1);
        expect(texts.some((text) => text.includes('secret'))).toBe(false);

        const peeker = createHeadlessGame({ width: 160, height: 90, scenes: { Peek: () => {
            const net = useNet();
            net.connect(connectLoopback(server!), { room: 'match' });
            return Peek();
        } } });
        games.push(peeker);
        expect(String(asked)).toMatch(/serverOnly, so it lives in the room/);
    });

    it('sends what changed last before the line goes, and keeps changing during the room\'s last deliveries', async () => {
        const last: string[] = [];
        const { player } = start({
            server: (net, board) => {
                net.onMessage('finish', (_data, from) => {
                    board.set((s) => { s.phase = 'over'; });
                    net.kick(from!, 'the match is over');
                });
                net.onLeave(() => board.set((s) => { s.blue += 10; }));
            },
            client: (net, board) => net.onDisconnect((reason) => last.push(`${reason}: ${board.state.phase}`)),
        });
        const ana = player();
        player();
        await pump(4);
        ana.net().send('finish');
        await pump(3);
        expect(last).toEqual(['the match is over: over']);

        const kept = roomBoard();
        const blueBefore = kept.state.blue;
        server!.room('match')!.destroy();
        // The last player's onLeave ran during destroy, and changed the store.
        expect(kept.state.blue).toBe(blueBefore + 10);

        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        kept.set((s) => { s.red = 50; });
        kept.set((s) => { s.red = 60; });
        expect(kept.state.red).toBe(0);
        expect(warn.mock.calls.filter((call) => String(call[0]).includes('after its room was destroyed')).length).toBe(1);
        warn.mockRestore();
    });

    it('keeps the last it saw while connecting again, with no trip back to the starting values', async () => {
        const reds: number[] = [];
        const { player } = start({
            server: (net, board) => net.onMessage<'red'>('goal', (team) => board.set((s) => { s[team] += 1; })),
            client: (_net, board) => board.watch((s) => s.red, (red) => reds.push(red)),
        });
        const ana = player();
        // Someone who stays, so the room is not ended while Ana connects again.
        player();
        await pump(4);
        ana.net().send('goal', 'red');
        await pump(3);
        expect(reds).toEqual([1, 1]);
        reds.length = 0;

        ana.net().connect(connectLoopback(server!), { room: 'match' });
        expect(ana.board().ready).toBe(false);
        expect(ana.board().state.red).toBe(1);
        await pump(4);
        expect(ana.board().ready).toBe(true);
        expect(reds).toEqual([]);
    });

    it('keeps the room\'s store through a change of scene, and forgets the watchers of the scene that went', async () => {
        const told: number[] = [];
        let after = -1;
        const Second: TSceneFn = () => {
            after = useRoomStore(score).state.red;
            return createScene();
        };
        const hooks: THooks = {
            server: (net, board) => {
                board.watch((s) => s.red, (red) => told.push(red));
                const scene = useScene();
                net.onMessage('next', () => {
                    board.set((s) => { s.red = 2; });
                    scene.change('Second');
                });
            },
        };
        const { player } = start(hooks, { scenes: { Match: makeMatch(hooks), Second } });
        const ana = player();
        await pump(4);
        ana.net().send('next');
        await pump(4);
        expect(after).toBe(2);
        expect(roomBoard().state.red).toBe(2);
        roomBoard().set((s) => { s.red = 3; });
        expect(told).toEqual([2]);
        expect(ana.board().state.red).toBe(2);
        await pump(3);
        expect(ana.board().state.red).toBe(3);
    });

    it('ends the line, saying why, when the server speaks another version', async () => {
        const reasons: string[] = [];
        const game = createHeadlessGame({ width: 160, height: 90, scenes: { Match: () => {
            const net = useNet();
            net.onDisconnect((reason) => reasons.push(reason));
            let hear: (text: string) => void = () => {};
            net.connect({
                send: () => setTimeout(() => hear(JSON.stringify({ k: 'welcome', v: 1, id: 'ana', room: 'match', players: ['ana'], r: 20 })), 0),
                onMessage: (fn) => { hear = fn; },
                onClose: () => {},
                close: () => {},
            });
            return createScene();
        } } });
        games.push(game);
        await settle();
        game.run(1);
        expect(reasons.length).toBe(1);
        expect(reasons[0]).toMatch(/version 1 .* version 2/);
    });

    it('compares nothing and sends nothing while no store changes', async () => {
        const texts: string[] = [];
        const room = createRoom({ width: 160, height: 90, scenes: { Match: makeMatch({}) }, clock: false, step: 60 });
        try {
            room.store(score);
            room.join({ send: (text) => texts.push(text), onMessage: () => {}, onClose: () => {}, close: () => {} }, 'ana');
            const welcomed = texts.filter((text) => text.startsWith('{"k":"st"')).length;
            expect(welcomed).toBe(1);
            room.step(10);
            expect(texts.filter((text) => text.startsWith('{"k":"st"')).length).toBe(welcomed);
            room.store(score).set((s) => { s.red = 1; });
            room.store(score).set((s) => { s.red = 0; });
            room.step(1);
            // Changed and changed back before anyone was told: nothing to tell.
            expect(texts.filter((text) => text.startsWith('{"k":"st"')).length).toBe(welcomed);
            room.store(score).set((s) => { s.blue = 2; });
            room.step(1);
            const last = texts.filter((text) => text.startsWith('{"k":"st"')).at(-1)!;
            expect(JSON.parse(last)).toEqual({ k: 'st', s: { score: [0, { blue: 2 }] } });
        } finally {
            room.destroy();
        }
    });

    it('will not take two declarations with one key in one game, nor be asked for outside a body', () => {
        const other = createRoomStore({ key: 'score', state: { red: 0 } });
        const room = createRoom({ width: 160, height: 90, scenes: { Match: makeMatch({}) }, clock: false });
        try {
            room.store(score);
            expect(() => room.store(other)).toThrow(/two room stores are called 'score'/);
        } finally {
            room.destroy();
        }
        expect(() => useRoomStore(score)).toThrow(/useRoomStore: called where nothing is being built/);
    });

    it('keeps its stores open for the room\'s cleanups, and closes them after', () => {
        const kept = createRoomStore({ key: 'kept', state: { saved: 0 } });
        const room = createRoom({ width: 160, height: 90, clock: false, scenes: { Match: () => {
            const board = useRoomStore(kept);
            useCleanup(() => board.set((s) => { s.saved = 1; }));
            return createScene();
        } } });
        const board = room.store(kept);
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        room.destroy();
        const late = warn.mock.calls.filter((call) => String(call[0]).includes('after its room was destroyed')).length;
        warn.mockRestore();
        expect(board.state.saved).toBe(1);
        expect(late).toBe(0);
        expect(() => room.store(kept)).toThrow(/store after destroy/);
    });

    it('keeps every branch nothing changed, all the way down, and never freezes what the caller put in', () => {
        const teams = createRoomStore({ key: 'teams', state: { teams: { a: { n: 1 }, b: { n: 2 } }, list: [] as number[] } });
        const room = createRoom({ width: 160, height: 90, clock: false, scenes: { Match: () => createScene() } });
        rooms.push(room);
        const board = room.store(teams);
        const told: string[] = [];
        board.watch((s) => s.teams.a, () => told.push('a'));
        board.watch((s) => s.teams.b, () => told.push('b'));
        board.set((s) => { s.teams.b.n = 3; });
        expect(told).toEqual(['b']);

        const mine = [1, 2];
        board.set((s) => { s.list = mine; });
        mine.push(3);
        expect(board.state.list).toEqual([1, 2]);
        const shell = Object.freeze({ inner: [1] });
        board.set((s) => { (s as { shell?: unknown }).shell = shell; });
        expect(() => { ((board.state as unknown as { shell: { inner: number[] } }).shell.inner).push(2); }).toThrow();
    });

    it('turns away what would not come back the same: a hole, a loop, a key called __proto__', () => {
        const room = createRoom({ width: 160, height: 90, clock: false, scenes: { Match: () => createScene() } });
        rooms.push(room);
        const board = room.store(score);
        expect(() => board.set((s) => { s.history = [1, , 3] as number[]; })).toThrow(/score\.history\[1\] is a hole/);
        expect(() => board.set((s) => { (s as Record<string, unknown>).self = s; })).toThrow(/score\.self holds itself/);
        expect(() => createRoomStore({ key: 'odd', state: JSON.parse('{"__proto__":{"n":1}}') })).toThrow(/key called __proto__/);
        expect(board.state).toEqual({ red: 0, blue: 0, phase: 'play', history: [] });
    });

    it('tells the others when a watcher throws, and takes a change made inside a watcher', () => {
        const room = createRoom({ width: 160, height: 90, clock: false, scenes: { Match: () => createScene() } });
        rooms.push(room);
        const board = room.store(score);
        const told: number[] = [];
        board.watch((s) => s.red, () => { throw new Error('broken watcher'); });
        board.watch((s) => s.red, (red) => {
            told.push(red);
            if (red === 1) board.set((s) => { s.blue = 5; });
        });
        const error = spyOn(console, 'error').mockImplementation(() => {});
        board.set((s) => { s.red = 1; });
        const reported = error.mock.calls.length;
        error.mockRestore();
        expect(told).toEqual([1]);
        expect(board.state.blue).toBe(5);
        expect(reported).toBe(1);
    });

    it('never sends a serverOnly store in the whole room, and turns it away once connected even if asked for before', async () => {
        const texts: string[] = [];
        const { player } = start({});
        const ana = player();
        await pump(4);
        const room = server!.room('match')!;
        room.store(secret).set((s) => { s.cheats = 2; });
        room.join({ send: (text) => texts.push(text), onMessage: () => {}, onClose: () => {}, close: () => {} }, 'watcher');
        await pump(2);
        expect(texts.some((text) => text.includes('"f":1'))).toBe(true);
        expect(texts.some((text) => text.includes('secret'))).toBe(false);
        void ana;

        let again: unknown = null;
        let net: TNetHandle | null = null;
        let spawnAsk: (() => unknown) | null = null;
        const Ask = () => {
            try {
                useRoomStore(secret);
            } catch (error) {
                again = error;
            }
            return createScene();
        };
        const solo = createHeadlessGame({ width: 160, height: 90, scenes: { Match: () => {
            net = useNet();
            useRoomStore(secret).set((s) => { s.cheats = 9; });
            spawnAsk = useSpawn(Ask);
            return createScene();
        } } });
        games.push(solo);
        net!.connect(connectLoopback(server!), { room: 'match' });
        spawnAsk!();
        expect(String(again)).toMatch(/serverOnly/);
    });

    it('shows the shared objects as the room has them when onConnect is heard', async () => {
        const seen: number[] = [];
        const Sign = () => useShared({ key: 'sign', fields: { n: 0 } });
        server = createServer({ width: 160, height: 90, clock: false, step: 60, scenes: { Match: () => {
            const net = useNet();
            const sign = Sign();
            if (net.role === 'server') net.onMessage('bump', () => { sign.fields.n += 5; });
            else net.onConnect(() => seen.push(sign.fields.n));
            return createScene();
        } } });
        let first: TNetHandle | null = null;
        const make = () => {
            const game = createHeadlessGame({ width: 160, height: 90, scenes: { Match: () => {
                const net = useNet();
                first ??= net;
                const sign = Sign();
                net.onConnect(() => seen.push(sign.fields.n));
                net.connect(connectLoopback(server!), { room: 'match', interpolation: 0.3 });
                return createScene();
            } } });
            games.push(game);
        };
        make();
        await pump(4);
        first!.send('bump');
        await pump(4);
        seen.length = 0;
        make();
        await pump(3);
        expect(seen).toEqual([5]);
    });

    it('turns away a game of another version, saying both numbers', async () => {
        server = createServer({ width: 160, height: 90, clock: false, scenes: { Match: () => createScene() } });
        let reason = '';
        let hear: (text: string) => void = () => {};
        const line: TNetConnection = {
            send: (text) => {
                const wire = JSON.parse(text) as { k: string; reason?: string };
                if (wire.k === 'bye') reason = wire.reason ?? '';
            },
            onMessage: (fn) => { hear = fn; },
            onClose: () => {},
            close: () => {},
        };
        server.accept(line);
        hear(JSON.stringify({ k: 'hello', v: 1, room: 'match', token: null }));
        await settle();
        expect(reason).toMatch(/version 1 .* version 2/);
    });

    it('moves to another room telling only what changed, and hears nothing more of the old one', async () => {
        const reds: number[] = [];
        const blues: number[] = [];
        const readies: boolean[] = [];
        const { player } = start({
            server: (net, board) => net.onMessage<{ red: number; blue: number }>('setTo', (to) => board.set((s) => { s.red = to.red; s.blue = to.blue; })),
            client: (_net, board) => {
                board.watch((s) => s.red, (red) => reds.push(red));
                board.watch((s) => s.blue, (blue) => {
                    blues.push(blue);
                    readies.push(board.ready);
                });
            },
        });
        const ana = player('a');
        const ben = player('b');
        await pump(4);
        ana.net().send('setTo', { red: 4, blue: 1 });
        ben.net().send('setTo', { red: 4, blue: 7 });
        await pump(4);
        reds.length = 0;
        blues.length = 0;

        ana.net().connect(connectLoopback(server!), { room: 'b' });
        await pump(4);
        expect(ana.board().state).toEqual({ red: 4, blue: 7, phase: 'play', history: [] });
        // Ana's red stayed 4 (no watcher told); her blue went from 1 to 7. Ben heard nothing.
        expect(reds).toEqual([]);
        expect(blues).toEqual([7]);
        // Told of the whole room's stores, a watcher already reads them as the room's.
        expect(readies.at(-1)).toBe(true);
    });

    it('gives room.store to the room\'s cleanups too', () => {
        const kept = createRoomStore({ key: 'kept', state: { saved: 0 } });
        let room: TRoom | null = null;
        room = createRoom({ width: 160, height: 90, clock: false, scenes: { Match: () => {
            useCleanup(() => room!.store(kept).set((s) => { s.saved = 2; }));
            return createScene();
        } } });
        const board = room.store(kept);
        room.destroy();
        expect(board.state.saved).toBe(2);
    });

    it('turns away an array with a key of its own, which JSON would leave behind', () => {
        const room = createRoom({ width: 160, height: 90, clock: false, scenes: { Match: () => createScene() } });
        rooms.push(room);
        const board = room.store(score);
        expect(() => board.set((s) => {
            const list = [1] as number[] & { note?: unknown };
            list.note = { n: 1 };
            s.history = list;
        })).toThrow(/score\.history is an array with a key called 'note'/);
        expect(() => board.set((s) => {
            const list = [] as unknown[] & { self?: unknown };
            list.self = list;
            (s as Record<string, unknown>).loop = list;
        })).toThrow(/key called 'self'/);
        expect(() => board.set((s) => {
            const list = [1] as number[] & Record<string, unknown>;
            list['4294967295'] = 7;
            s.history = list;
        })).toThrow(/key called '4294967295'/);
        expect(() => board.set((s) => {
            (s as Record<symbol, unknown>)[Symbol('tag')] = 1;
        })).toThrow(/score has a symbol key, Symbol\(tag\)/);
        expect(() => board.set((s) => {
            const list = [1];
            Object.defineProperty(list, 'hidden', { value: 2, enumerable: false });
            s.history = list;
        })).toThrow(/score\.history has a hidden key, hidden/);
    });

    it('says once that set\'s function changes its argument, when one hands back a whole new state', () => {
        const room = createRoom({ width: 160, height: 90, clock: false, scenes: { Match: () => createScene() } });
        rooms.push(room);
        const board = room.store(score);
        board.set((s) => { s.red = 3; });
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        // A short assignment hands back a number, and changes the state: never said.
        board.set((s) => s.blue = 4);
        expect(warn.mock.calls.length).toBe(0);
        board.set(() => ({ red: 0, blue: 0, phase: 'play', history: [] }) as never);
        board.set(() => ({ red: 0 }) as never);
        const told = warn.mock.calls.filter((call) => String(call[0]).includes('handed back an object and changed nothing')).length;
        warn.mockRestore();
        expect(told).toBe(1);
        expect(board.state.red).toBe(3);
        expect(board.state.blue).toBe(4);
    });

    it('shows a player\'s own object as the room has it when onConnect is heard', async () => {
        const seen: number[] = [];
        const Mine = () => useShared({ key: 'mine', owner: 'ana', fields: { hp: 0 }, move: () => {} });
        server = createServer({ width: 160, height: 90, clock: false, step: 60, admit: ({ token }) => token ?? false, scenes: { Match: () => {
            const net = useNet();
            const mine = Mine();
            if (net.role === 'server') mine.fields.hp = 9;
            return createScene();
        } } });
        const ana = createHeadlessGame({ width: 160, height: 90, scenes: { Match: () => {
            const net = useNet();
            const mine = Mine();
            net.onConnect(() => seen.push(mine.fields.hp));
            net.connect(connectLoopback(server!), { room: 'match', token: 'ana' });
            return createScene();
        } } });
        games.push(ana);
        await pump(4);
        expect(seen).toEqual([9]);
    });

    it('roomStoreOf takes only a game made with createGame', async () => {
        await expect(roomStoreOf({} as never, score)).rejects.toThrow(/not a game made with createGame/);
        await expect(roomStoreOf({} as never, { key: 'x' } as never)).rejects.toThrow(/declared with createRoomStore/);
    });

    it('warns once, with the first room, of the game\'s stores every room would share, and never without them', async () => {
        const script = (withStore: boolean) => `
            const { createScene } = await import('${import.meta.dir}/../src');
            const { createGameStore } = await import('${import.meta.dir}/../src');
            const { createRoom } = await import('${import.meta.dir}/../src/net');
            const said = [];
            console.warn = (text) => said.push(String(text));
            ${withStore ? "createGameStore({ key: 'coins', state: { n: 0 } });" : ''}
            for (let i = 0; i < 2; i++) createRoom({ width: 16, height: 9, clock: false, scenes: { A: () => createScene() } }).destroy();
            process.stdout.write(JSON.stringify(said.filter((text) => text.includes('every room of this server shares them'))));
        `;
        const run = async (withStore: boolean) => {
            const child = Bun.spawn(['bun', '-e', script(withStore)], { stdout: 'pipe', stderr: 'pipe' });
            const out = await new Response(child.stdout).text();
            await child.exited;
            return JSON.parse(out) as string[];
        };
        const warned = await run(true);
        expect(warned.length).toBe(1);
        expect(warned[0]).toContain("'coins'");
        expect(await run(false)).toEqual([]);
    });

    it('compares nothing while no store changes', () => {
        const room = createRoom({ width: 160, height: 90, clock: false, scenes: { Match: () => createScene() } });
        rooms.push(room);
        const stringify = spyOn(JSON, 'stringify');
        const callsIn = (fn: () => void): number => {
            const before = stringify.mock.calls.length;
            fn();
            return stringify.mock.calls.length - before;
        };
        // What the room's step writes on its own, with no store at all.
        const bare = callsIn(() => room.step(5));
        const board = room.store(score);
        board.set((s) => { s.history = Array.from({ length: 50 }, (_, i) => i); });
        room.step(1);
        const quiet = callsIn(() => room.step(5));
        const changed = callsIn(() => board.set((s) => { s.red = 1; }));
        stringify.mockRestore();
        expect(quiet).toBe(bare);
        expect(changed).toBeGreaterThan(0);
    });
});
