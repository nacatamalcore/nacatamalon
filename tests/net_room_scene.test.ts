import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene, useReady, useScene, useSpawn, useUpdate } from '../src';
import { createHeadlessGame } from '../src/headless';
import { connectLoopback, createRoomStore, createServer, useNet, useNetSpawn, useRoomStore, useShared } from '../src/net';
import { fade } from '../src/transition';
import type { THeadlessGame } from '../src/headless';
import type { TNetHandle, TServer, TServerOptions, TShared } from '../src/net';
import type { TSceneFn } from '../src';

/**
 * A room that changes its scene (`useScene().change` in the server's room): its players in the
 * room's scene follow it, on the same line and in the same room, seeing the new one whole at its
 * `onConnect`.
 */

const settle = () => new Promise((done) => setTimeout(done, 5));

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

const round = createRoomStore({ key: 'round', state: { at: '' } });

/** What each player's game saw, by player and scene. */
let log: string[] = [];
/** The room store as the last scene a player's game built reads it. */
let lastStore: { state: { at: string } } | null = null;
/** The board of the last scene a player's game built. */
let lastBoard: TShared<{ scene: string }> | null = null;

type THooks = {
    server?: (net: TNetHandle, name: string) => void;
    client?: (net: TNetHandle, name: string) => void;
};

/**
 * A scene of the game: a board every game builds (`key: 'board'`, the same in every scene) holding
 * the scene's name, a room store saying where the room is, and, on the server, a message that changes
 * the room's scene.
 */
const place = (name: string, hooks: THooks = {}): TSceneFn => () => {
    const net = useNet();
    const store = useRoomStore(round);
    const board = useShared({ key: 'board', fields: { scene: '' } });
    if (net.role === 'server') {
        board.fields.scene = name;
        store.set((s) => { s.at = name; });
        const scene = useScene();
        net.onMessage<{ to: string; fade?: number }>('next', ({ to, fade: seconds }) => {
            scene.change(to, seconds === undefined ? undefined : { transition: fade(seconds) });
        });
        hooks.server?.(net, name);
        return createScene();
    }
    lastBoard = board as unknown as TShared<{ scene: string }>;
    let first = true;
    useUpdate(() => {
        if (!first) return;
        first = false;
        log.push(`${net.me} ${name}: first update ${net.status}`);
    });
    lastStore = store;
    net.onConnect(() => log.push(`${net.me} ${name}: connect, board '${String(board.fields.scene)}', store '${store.state.at}' ready ${store.ready}`));
    net.onLeave((who) => log.push(`${net.me} ${name}: leave ${who}`));
    net.onDisconnect((reason) => log.push(`${net.me} ${name}: disconnect ${reason}`));
    hooks.client?.(net, name);
    return createScene();
};

const pump = async (times = 1) => {
    for (let i = 0; i < times; i++) {
        await settle();
        for (const game of games) game.run(1);
        for (const name of server?.rooms ?? []) server!.room(name)!.step(1);
    }
};

type TStart = {
    server?: THooks;
    client?: THooks;
    options?: Partial<TServerOptions>;
    serverScenes?: Record<string, TSceneFn>;
    clientScenes?: Record<string, TSceneFn>;
};

const start = (given: TStart = {}) => {
    log = [];
    server = createServer({
        width: 160, height: 90, clock: false, step: 20,
        scenes: { Locker: place('Locker', given.server), Match: place('Match', given.server), Podium: place('Podium', given.server), ...given.serverScenes },
        ...given.options,
    });
    const player = (options: { sceneTransition?: boolean; sceneFade?: number; initialScene?: string } = {}) => {
        const nets: TNetHandle[] = [];
        let connected = false;
        const hooks: THooks = {
            client: (net, name) => {
                nets.push(net);
                given.client?.client?.(net, name);
                if (!connected) {
                    connected = true;
                    net.connect(connectLoopback(server!), { room: 'main', ...(options.sceneTransition === true || options.sceneFade !== undefined ? { sceneTransition: fade(options.sceneFade ?? 0.2) } : {}) });
                }
            },
        };
        const game = createHeadlessGame({
            width: 160, height: 90, step: 20,
            ...(options.initialScene === undefined ? {} : { initialScene: options.initialScene }),
            scenes: { Locker: place('Locker', hooks), Match: place('Match', hooks), Podium: place('Podium', hooks), ...given.clientScenes },
        });
        games.push(game);
        return { game, net: () => nets.at(-1)!, scenes: () => [...game.scenes] };
    };
    return { player };
};

/** Pumps until `done` or `times` steps. */
const until = async (done: () => boolean, times = 60) => {
    for (let i = 0; i < times && !done(); i++) await pump(1);
};

describe('nacatamalon/net: following the room\'s scene', () => {
    it('follows the room from scene to scene, in the same room, seeing each whole at onConnect', async () => {
        const { player } = start();
        const ana = player();
        const ben = player();
        await pump(4);
        log = [];
        ana.net().send('next', { to: 'Match' });
        await pump(4);
        expect(ana.scenes()).toEqual(['Match']);
        expect(ben.scenes()).toEqual(['Match']);
        for (const who of ['player-1', 'player-2']) {
            expect(log).toContain(`${who} Match: connect, board 'Match', store 'Match' ready true`);
            expect(log).toContain(`${who} Match: first update online`);
        }
        expect(log.some((line) => line.includes('leave') || line.includes('disconnect'))).toBe(false);
        expect(ana.net().room).toBe('main');
        expect(ana.net().me).toBe('player-1');
        expect(ana.net().players).toEqual(['player-1', 'player-2']);
        expect(ana.net().scene).toBe('Match');

        log = [];
        ben.net().send('next', { to: 'Podium' });
        await pump(4);
        expect(ana.scenes()).toEqual(['Podium']);
        expect(log).toContain("player-1 Podium: connect, board 'Podium', store 'Podium' ready true");
    });

    it('follows a change the server covers, under the player\'s own transition, with the same key in both', async () => {
        const { player } = start();
        const ana = player({ sceneTransition: true });
        await pump(4);
        log = [];
        ana.net().send('next', { to: 'Match', fade: 0.2 });
        await until(() => ana.scenes().join() === 'Match' && ana.net().status === 'online');
        expect(ana.scenes()).toEqual(['Match']);
        expect(log).toContain("player-1 Match: connect, board 'Match', store 'Match' ready true");
        expect(log.filter((line) => line.startsWith('player-1 Match'))[0]).toContain('connect');
    });

    it('starts the scene again when the room restarts it', async () => {
        let made = 0;
        const { player } = start({ client: { client: (_net, name) => { if (name === 'Locker') made += 1; } } });
        const ana = player();
        await pump(4);
        expect(made).toBe(1);
        ana.net().send('next', { to: 'Locker' });
        await pump(4);
        expect(made).toBe(2);
        expect(ana.net().status).toBe('online');
    });

    it('goes straight to the last scene when the new one changes from its useReady', async () => {
        const Match: TSceneFn = () => {
            const scene = useScene();
            if (useNet().role === 'server') useReady(() => scene.change('Podium'));
            return place('Match')({});
        };
        let built = 0;
        const { player } = start({ serverScenes: { Match }, client: { client: (_net, name) => { if (name === 'Match') built += 1; } } });
        const ana = player();
        await pump(4);
        ana.net().send('next', { to: 'Match' });
        await pump(5);
        // The scene the room only went through is never built here.
        expect(built).toBe(0);
        expect(ana.scenes()).toEqual(['Podium']);
        expect(ana.net().scene).toBe('Podium');
        expect(log).toContain("player-1 Podium: connect, board 'Podium', store 'Podium' ready true");
    });

    it('keeps a HUD\'s keys and its count of players, and lets the old scene\'s spawned objects go', async () => {
        const counted: string[] = [];
        let score: TShared<{ goals: number }> | null = null;
        let hudNet: TNetHandle | null = null;
        const Coin = () => {};
        const Hud: TSceneFn = () => {
            const net = useNet();
            score = useShared({ key: 'score', fields: { goals: 0 } });
            let players = 0;
            net.onJoin(() => { players += 1; counted.push(`join ${players}`); });
            net.onLeave(() => { players -= 1; counted.push(`leave ${players}`); });
            net.onConnect(() => counted.push('connect'));
            return createScene();
        };
        const ServerHud: TSceneFn = () => {
            const shared = useShared({ key: 'score', fields: { goals: 0 } });
            useUpdate(() => { shared.fields.goals += 1; });
            return createScene();
        };
        const withCoin = (name: string): TSceneFn => () => {
            const spawn = useNetSpawn('coin', Coin);
            if (useNet().role === 'server') spawn();
            return place(name)({});
        };
        const { player } = start({
            serverScenes: { Locker: () => { useScene().launch('Hud'); return withCoin('Locker')({}); }, Match: withCoin('Match'), Hud: ServerHud },
            clientScenes: {
                Locker: () => {
                    const net = useNet();
                    hudNet = net;
                    if (net.status === 'offline') {
                        useScene().launch('Hud');
                        net.connect(connectLoopback(server!), { room: 'main' });
                    }
                    return withCoin('Locker')({});
                },
                Match: withCoin('Match'),
                Hud,
            },
        });
        const ana = player();
        await pump(6);
        const net = hudNet!;
        expect(counted).toEqual(['connect', 'join 1']);
        expect(ana.game.findAll('Coin').length).toBe(1);
        counted.length = 0;
        const before = score!.fields.goals;
        net.send('next', { to: 'Match' });
        await pump(8);
        expect(ana.scenes()).toEqual(['Hud', 'Match']);
        // The HUD hears the room whole again, and no one came or went.
        expect(counted).toEqual(['connect']);
        expect(score!.fields.goals).toBeGreaterThan(before);
        // The locker's coin went with it; the match's is here.
        expect(ana.game.findAll('Coin').length).toBe(1);
    });

    it('tells no one of a scene the room launches beside its own', async () => {
        const { player } = start({
            serverScenes: { Extra: () => createScene() },
            server: { server: (net, name) => {
                if (name !== 'Locker') return;
                const scene = useScene();
                net.onMessage('extra', () => scene.launch('Extra'));
            } },
        });
        const ana = player();
        await pump(4);
        log = [];
        ana.net().send('extra');
        await pump(4);
        expect(server!.room('main')!.find('Extra')).toBeDefined();
        expect(ana.scenes()).toEqual(['Locker']);
        expect(ana.net().status).toBe('online');
        expect(ana.net().scene).toBe('Locker');
        expect(log).toEqual([]);
    });

    it('does not change the scene of a game that is not in the room\'s, and says the new one', async () => {
        let menuNet: TNetHandle | null = null;
        const { player } = start({ clientScenes: { Menu: () => {
            const net = useNet();
            menuNet = net;
            if (net.status === 'offline') net.connect(connectLoopback(server!), { room: 'main' });
            return createScene();
        } } });
        const menu = player({ initialScene: 'Menu' });
        const ana = player();
        await pump(4);
        ana.net().send('next', { to: 'Match' });
        await pump(4);
        expect(menu.scenes()).toEqual(['Menu']);
        expect(menuNet!.scene).toBe('Match');
        expect(menuNet!.status).toBe('online');
        expect(ana.scenes()).toEqual(['Match']);
    });

    it('closes the line, saying why, when the player\'s game has no scene the room went to', async () => {
        const { player } = start({ serverScenes: { Secret: place('Secret') } });
        const ana = player();
        await pump(4);
        ana.net().send('next', { to: 'Secret' });
        await pump(4);
        expect(ana.net().status).toBe('closed');
        expect(log.some((line) => line.endsWith("Locker: disconnect the game has no scene 'Secret' for room 'main'"))).toBe(true);
        expect(ana.scenes()).toEqual(['Locker']);
    });

    it('tells the players nothing when the room\'s new scene throws, and they stay in the old one', async () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        const Match: TSceneFn = () => {
            // Shares its board (the same key as the locker's) and a change of the room's store, then throws.
            const made = place('Match')({});
            if (useNet().role === 'server') {
                useNet().broadcast('noise', 1);
                throw new Error('no match today');
            }
            return made;
        };
        const { player } = start({ serverScenes: { Match } });
        const ana = player();
        await pump(4);
        const board = lastBoard!;
        ana.net().send('next', { to: 'Match' });
        for (let i = 0; i < 4; i++) {
            await settle();
            ana.game.run(1);
            try {
                server!.room('main')!.step(1);
            } catch {
                // The room's own error, said there.
            }
        }
        error.mockRestore();
        expect(ana.scenes()).toEqual(['Locker']);
        expect(ana.net().status).toBe('online');
        expect(ana.net().scene).toBe('Locker');
        // The locker's board is the room's again, and the store says what the room has.
        await pump(10);
        expect(board.fields.scene).toBe('Locker');
        expect(server!.room('main')!.store(round).state.at).toBe('Match');
        expect(useRoomStoreOf(ana)).toBe('Match');
    });

    it('ends the players\' lines when the room is left with no scene', async () => {
        const error = spyOn(console, 'error').mockImplementation(() => {});
        const Match: TSceneFn = () => {
            const scene = useScene();
            if (useNet().role === 'server') useReady(() => scene.stop());
            return place('Match')({});
        };
        const { player } = start({ serverScenes: { Match } });
        const ana = player();
        await pump(4);
        ana.net().send('next', { to: 'Match', fade: 0.2 });
        await pump(30);
        error.mockRestore();
        expect(ana.net().status).toBe('closed');
        expect(log.some((line) => line.includes("disconnect room 'main' was left with no scene"))).toBe(true);
    });

    it('throws on a joinRoom while the room\'s scene is changing', async () => {
        const { player } = start();
        const ana = player({ sceneTransition: true });
        await pump(4);
        ana.net().send('next', { to: 'Match' });
        await pump(2);
        expect(() => ana.net().joinRoom('other')).toThrow("while room 'main' is changing its scene to 'Match'");
    });

    it('says the scene the room runs now to whoever comes in later, and to one coming in under a covered change', async () => {
        // Whether the room still ran its old scene when a player heard it was in the new one.
        const early: boolean[] = [];
        const { player } = start({ client: { client: (net, name) => {
            if (name === 'Match') net.onConnect(() => early.push(server!.room('main')!.find('Locker') !== undefined));
        } } });
        const ana = player();
        await pump(4);
        ana.net().send('next', { to: 'Match', fade: 2 });
        await pump(3);
        expect(server!.room('main')!.find('Locker')).toBeDefined();
        // Comes in from the locker while the room's change is covered: it follows, as the others.
        const ben = player();
        await until(() => ben.net()?.status === 'online' && ana.net().status === 'online' && ben.scenes().join() === 'Match', 120);
        expect(ben.scenes()).toEqual(['Match']);
        expect(ben.net().scene).toBe('Match');
        expect(log).toContain("player-2 Match: connect, board 'Match', store 'Match' ready true");
        // And later, straight in.
        const cid = player({ initialScene: 'Match' });
        await until(() => cid.net()?.status === 'online');
        expect(cid.net().scene).toBe('Match');
        expect(log).toContain("player-3 Match: connect, board 'Match', store 'Match' ready true");
        expect(early.length).toBeGreaterThanOrEqual(3);
        expect(early.every((old) => !old)).toBe(true);
    });

    it('follows a room that changed its scene as it started, and its changes after', async () => {
        const Boot: TSceneFn = () => {
            const scene = useScene();
            if (useNet().role === 'server') useReady(() => scene.change('Locker'));
            return createScene();
        };
        const { player } = start({ serverScenes: { Boot }, options: { roomScene: () => 'Boot' } });
        const ana = player();
        await pump(4);
        expect(ana.net().scene).toBe('Locker');
        ana.net().send('next', { to: 'Match' });
        await pump(4);
        expect(ana.scenes()).toEqual(['Match']);
    });

    it('goes straight to the newest scene, with its own whole room, when the room changed twice meanwhile', async () => {
        const { player } = start();
        const ana = player();
        await pump(4);
        log = [];
        // Ana's page takes no step while the room goes Locker, Match, Podium.
        ana.net().send('next', { to: 'Match' });
        await settle();
        for (let i = 0; i < 3; i++) server!.room('main')!.step(1);
        ana.net().send('next', { to: 'Podium' });
        await settle();
        for (let i = 0; i < 3; i++) server!.room('main')!.step(1);
        await pump(4);
        expect(ana.scenes()).toEqual(['Podium']);
        expect(log.filter((line) => line.includes(': connect,'))).toEqual(["player-1 Podium: connect, board 'Podium', store 'Podium' ready true"]);
    });

    it('does not tell onConnect to a scene the room left before this page got there', async () => {
        const Match: TSceneFn = () => {
            const net = useNet();
            if (net.role === 'server') {
                const scene = useScene();
                let steps = 0;
                // The room moves on before the player's own transition is over.
                useUpdate(() => { steps += 1; if (steps === 4) scene.change('Podium'); });
            }
            return place('Match')({});
        };
        const { player } = start({ serverScenes: { Match } });
        // A slow cover here: the room is in the podium before the page has uncovered the match.
        const ana = player({ sceneFade: 2 });
        await pump(4);
        log = [];
        ana.net().send('next', { to: 'Match' });
        await until(() => ana.scenes().join() === 'Podium' && ana.net().status === 'online', 200);
        expect(ana.scenes()).toEqual(['Podium']);
        expect(log.filter((line) => line.includes(': connect,'))).toEqual(["player-1 Podium: connect, board 'Podium', store 'Podium' ready true"]);
    });

    it('keeps the room\'s stores ready while it follows', async () => {
        const seen: boolean[] = [];
        let store: { ready: boolean } | null = null;
        const { player } = start({ client: { client: (net) => {
            store = useRoomStore(round);
            useUpdate(() => { if (net.status === 'connecting' && net.me !== null) seen.push(store!.ready); });
        } } });
        const ana = player({ sceneTransition: true });
        await pump(4);
        ana.net().send('next', { to: 'Match', fade: 0.2 });
        await until(() => ana.scenes().join() === 'Match' && ana.net().status === 'online');
        expect(seen.length).toBeGreaterThan(0);
        expect(seen.every((ready) => ready)).toBe(true);
    });
});

/** What a player's game reads of the room's store, through the last scene it built. */
const useRoomStoreOf = (who: { net: () => TNetHandle }): string => {
    void who;
    return lastStore!.state.at;
};

void useSpawn;
