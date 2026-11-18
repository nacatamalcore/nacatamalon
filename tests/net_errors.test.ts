import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene, destroy, useScene, useSpawn, useUpdate } from '../src';
import { createHeadlessGame } from '../src/headless';
import { getActiveGame } from '../src/store';
import { connectLoopback, createServer, useNet } from '../src/net';
import type { THeadlessGame } from '../src/headless';
import type { TNetHandle, TServer } from '../src/net';

/**
 * What the network runs of the game's (a listener, an object's move, a spawner) and throws is said
 * as what it is and where, not as a scene's update.
 */

const settle = () => new Promise((done) => setTimeout(done, 5));

let server: TServer | null = null;
const games: THeadlessGame[] = [];

afterEach(() => {
    for (const game of games.splice(0)) game.destroy();
    server?.close();
    server = null;
});

describe('nacatamalon/net: errors', () => {
    it('says which listener threw, in which room of the server, and in a player\'s game', async () => {
        const said: string[] = [];
        const error = spyOn(console, 'error').mockImplementation((text: unknown) => { said.push(String(text)); });
        server = createServer({
            width: 160, height: 90, clock: false,
            scenes: { Lobby: () => {
                const net = useNet();
                if (net.role === 'server') net.onMessage('goal', () => { throw new Error('no goals here'); });
                else net.onConnect(() => { throw new Error('no welcome here'); });
                return createScene();
            } },
        });
        let net: TNetHandle | null = null;
        const game = createHeadlessGame({
            width: 160, height: 90,
            scenes: { Lobby: () => {
                net = useNet();
                net.onConnect(() => { throw new Error('no welcome here'); });
                net.connect(connectLoopback(server!), { room: 'lobby' });
                return createScene();
            } },
        });
        games.push(game);
        let thrown = '';
        for (let i = 0; i < 4; i++) {
            await settle();
            try {
                game.run(1);
            } catch (e) {
                thrown = (e as Error).message;
            }
            server.room('lobby')?.step(1);
        }
        net!.send('goal');
        await settle();
        let roomThrew = '';
        try {
            server.room('lobby')!.step(1);
        } catch (e) {
            roomThrew = (e as Error).message;
        }
        error.mockRestore();
        expect(thrown).toBe('no welcome here');
        expect(roomThrew).toBe('no goals here');
        expect(said).toContain("[NacatamalOn] useNet: an onConnect listener threw, in a player's game. What it was doing is lost each time; everything else goes on.");
        expect(said).toContain("[NacatamalOn] useNet: an onMessage listener of 'goal' threw, in room 'lobby' of the server. What it was doing is lost each time; everything else goes on.");
    });
});

describe('nacatamalon/net: a room', () => {
    it('changes scene under a transition that crosses at once, with no picture to wait for', async () => {
        const { createRoom } = await import('../src/net');
        const { useScene } = await import('../src');
        const { crossfade } = await import('../src/transition');
        let scene: ReturnType<typeof useScene> | null = null;
        const room = createRoom({
            width: 160, height: 90, clock: false, step: 20,
            scenes: {
                First: () => { scene = useScene(); return createScene(); },
                Second: () => createScene(),
            },
        });
        scene!.change('Second', { transition: crossfade(0.2) });
        // The swap on the next step: a crossing waits for a picture of the scene going out, and a
        // room's renderer, drawing none, counts it taken rather than let it wait a second.
        room.step(2);
        expect(room.find('Second')).toBeDefined();
        expect(room.find('First')).toBeUndefined();
        room.destroy();
    });
});

describe('nacatamalon/net: a hidden page', () => {
    it('hears what the room says while hidden, with no step, its objects as they are now', async () => {
        const { useShared, useNetSpawn } = await import('../src/net');
        const { useSelf, useTransform } = await import('../src');
        const heard: number[] = [];
        let ball: { fields: { n: number } } | null = null;
        const Ball = () => {
            const self = useSelf();
            useTransform({ x: 0, y: 0 });
            const shared = useShared({ key: 'ball', fields: { n: 0 } });
            ball = shared as unknown as { fields: { n: number } };
            void self;
        };
        const Coin = () => { useTransform({ x: 0, y: 0 }); };
        server = createServer({
            width: 160, height: 90, clock: false, step: 20,
            scenes: { Lobby: () => {
                const net = useNet();
                const spawnBall = useSpawn(Ball);
                const made = spawnBall();
                const spawnCoin = useNetSpawn('coin', Coin);
                if (net.role === 'server') {
                    const coin = spawnCoin();
                    let n = 0;
                    useUpdate(() => {
                        n += 1;
                        made.transform!.x = n;
                        ball!.fields.n = n;
                        net.broadcast('tick', n);
                        // Ended by the room while the player's page is hidden.
                        if (n === 15) destroy(coin);
                    });
                }
                return createScene();
            } },
        });
        let net: TNetHandle | null = null;
        let clientBall: { fields: { n: number } } | null = null;
        let canvas: HTMLCanvasElement | null = null;
        const game = createHeadlessGame({
            width: 160, height: 90,
            scenes: { Lobby: () => {
                net = useNet();
                canvas = getActiveGame()!.get('screen').canvas;
                const spawnBall = useSpawn(Ball);
                spawnBall();
                useNetSpawn('coin', Coin);
                clientBall = ball;
                net.onMessage<number>('tick', (n) => heard.push(n));
                net.connect(connectLoopback(server!), { room: 'lobby' });
                return createScene();
            } },
        });
        games.push(game);
        for (let i = 0; i < 4; i++) {
            await settle();
            game.run(1);
            server.room('lobby')?.step(1);
        }
        expect(net!.status).toBe('online');
        expect(game.findAll('Coin').length).toBe(1);
        heard.length = 0;
        // The page the game's canvas is in, hidden.
        const page = canvas!.ownerDocument as unknown as { hidden?: boolean };
        page.hidden = true;
        try {
            // The room goes on for two seconds; the page takes no step.
            for (let i = 0; i < 40; i++) server.room('lobby')!.step(1);
            await new Promise((done) => setTimeout(done, 400));
        } finally {
            page.hidden = false;
        }
        // Every tick of those two seconds heard, the last one among them, with no step taken.
        expect(heard.length).toBeGreaterThanOrEqual(40);
        expect(heard.at(-1)).toBe(heard[0]! + heard.length - 1);
        expect(heard.at(-1)).toBeGreaterThanOrEqual(44);
        // The ball's fields as the room has them now, not waiting to be shown later.
        expect(clientBall!.fields.n).toBeGreaterThanOrEqual(heard.at(-1)! - 1);
        // The coin the room ended is gone from the page, not kept until it comes back.
        expect(game.findAll('Coin').length).toBe(0);
    });

    it('keeps two placements of each object while hidden, and sends its fields through at once', async () => {
        const { clientCatchUp, emptyShare } = await import('../src/net/net_share');
        const share = emptyShare();
        const entry = {
            samples: Array.from({ length: 50 }, (_, t) => ({ t, s: [t, 0, 0, 0, 1, 1, 0, 0, 1] })),
            fieldQueue: [{ t: 1, f: { n: 1 } }, { t: 2, f: { n: 2, won: true } }, { t: 3, f: {}, r: ['won'] }],
            fields: { n: 0 } as Record<string, unknown>,
        };
        share.entries.set('ball', entry as never);
        clientCatchUp(share);
        expect(entry.samples.map((sample) => sample.t)).toEqual([48, 49]);
        expect(entry.fieldQueue).toEqual([]);
        expect(entry.fields).toEqual({ n: 2 });
    });

    const hiddenMove = async (when: 'asked' | 'covered' | 'game cover') => {
        const { useShared } = await import('../src/net');
        const { useTransform } = await import('../src');
        const { fade } = await import('../src/transition');
        const { netGameOf } = await import('../src/net/net_game');
        let ball: { fields: { n: number } } | null = null;
        const Ball = () => {
            useTransform({ x: 0, y: 0 });
            ball = useShared({ key: 'ball', fields: { n: 0 } }) as unknown as { fields: { n: number } };
        };
        const Pool = () => {
            const net = useNet();
            const made = useSpawn(Ball)();
            if (net.role === 'server') {
                let n = 0;
                useUpdate(() => {
                    n += 1;
                    made.transform!.x = n;
                    ball!.fields.n = n;
                    net.broadcast('tick', n);
                });
            }
            return createScene();
        };
        server = createServer({
            width: 160, height: 90, clock: false, step: 20,
            scenes: { Lobby: () => { useNet(); return createScene(); }, Pool },
            roomScene: (room) => (room === 'pool' ? 'Pool' : 'Lobby'),
        });
        const heard: number[] = [];
        let net: TNetHandle | null = null;
        let store: ReturnType<typeof getActiveGame> = null;
        let canvas: HTMLCanvasElement | null = null;
        let mine: { fields: { n: number } } | null = null;
        const connects: string[] = [];
        let scene: ReturnType<typeof useScene> | null = null;
        const game = createHeadlessGame({
            width: 160, height: 90,
            scenes: {
                Lobby: () => {
                    net = useNet();
                    scene = useScene();
                    store = getActiveGame();
                    canvas = store!.get('screen').canvas;
                    net.connect(connectLoopback(server!), { room: 'lobby' });
                    return createScene();
                },
                Pool: () => {
                    const here = useNet();
                    here.onMessage<number>('tick', (n) => heard.push(n));
                    here.onConnect(() => connects.push(here.room!));
                    useSpawn(Ball)();
                    mine = ball;
                    return createScene();
                },
                Hud: () => createScene(),
            },
        });
        games.push(game);
        const pump = async (times: number) => {
            for (let i = 0; i < times; i++) {
                await settle();
                game.run(1);
                for (const name of server!.rooms) server!.room(name)!.step(1);
            }
        };
        await pump(4);
        expect(net!.status).toBe('online');
        // The game's own cover, a HUD fading in for four seconds, under way as the player moves.
        if (when === 'game cover') scene!.launch('Hud', { transition: fade(4) });
        const gameCover = store!.get('transition').active;
        let kept = false;
        // Left on its way when the game ends at the end of the test: heard, not thrown.
        net!.joinRoom('pool', { transition: fade(1) }).then(() => { kept = true; }, () => {});
        if (when === 'covered') {
            // Until the cover is on its way: the pool let the player in, its scene waits behind it.
            for (let i = 0; i < 20 && store!.get('transition').active === null; i++) await pump(1);
            expect(store!.get('transition').active).not.toBeNull();
        }
        expect(kept).toBe(false);

        // Hidden as it crosses the door; the pool goes on for two seconds, the page takes no step.
        const page = canvas!.ownerDocument as unknown as { hidden?: boolean };
        page.hidden = true;
        try {
            for (let i = 0; i < 40; i++) {
                server.room('pool')?.step(1);
                await settle();
            }
            await new Promise((done) => setTimeout(done, 600));
            if (when === 'game cover') {
                // The game's cover moves by the time gone by, not to its end; the move waits for it.
                const active = store!.get('transition').active;
                expect(active).toBe(gameCover);
                expect(active!.elapsed).toBeLessThan(2);
                expect(kept).toBe(false);
                return;
            }
            // Moved while hidden: in the pool's scene, nothing kept back, its ticks heard as they come.
            expect(kept).toBe(true);
            // Started hidden, as a cut: no cover was ever begun for nobody to see.
            if (when === 'asked') expect(store!.get('transition').active).toBeNull();
            expect(net!.room).toBe('pool');
            expect(game.scenes).toEqual(['Pool']);
            expect(netGameOf(store!).held).toBeNull();
            expect(connects).toEqual(['pool']);
            expect(heard.length).toBeGreaterThan(20);
        } finally {
            page.hidden = false;
        }
        await pump(4);
        // Every tick heard once, in order, and the ball where the pool has it.
        expect(heard).toEqual(heard.map((_, i) => heard[0]! + i));
        expect(mine!.fields.n).toBeGreaterThanOrEqual(heard.at(-1)! - 1);
        expect(store!.get('transition').active).toBeNull();
    };

    it('crosses to another room while hidden, as a cut, rather than keeping the room for its return', async () => {
        await hiddenMove('asked');
    });

    it('ends a cover already on its way when hidden, and crosses to the other room', async () => {
        await hiddenMove('covered');
    });

    it('moves a cover of the game\'s own by the time gone by while hidden, not to its end', async () => {
        await hiddenMove('game cover');
    });
});
