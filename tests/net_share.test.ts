import { afterEach, describe, expect, it } from 'bun:test';
import { createScene, destroy, useSelf, useSpawn, useUpdate } from '../src';
import { createHeadlessGame } from '../src/headless';
import { connectLoopback, createServer, useNet, useNetSpawn, useShared } from '../src/net';
import type { THeadlessGame } from '../src/headless';
import type { TNetHandle, TServer, TServerOptions, TShared } from '../src/net';
import type { TGameObject, TSceneFn } from '../src';

/**
 * Shared objects (`useShared`, `useNetSpawn`): made by the server and seen by every player's game,
 * where they are and what their fields hold travelling on their own; a player's own moved ahead by
 * their page and corrected by the server; the server reading a player's actions and looking back.
 */

const settle = () => new Promise((done) => setTimeout(done, 5));

let server: TServer | null = null;
const games: THeadlessGame[] = [];

afterEach(() => {
    for (const game of games.splice(0)) game.destroy();
    server?.close();
    server = null;
});

const ACTIONS = [
    { name: 'left', bindings: [{ type: 'key' as const, key: 'ArrowLeft' }] },
    { name: 'right', bindings: [{ type: 'key' as const, key: 'ArrowRight' }] },
    { name: 'fire', bindings: [{ type: 'key' as const, key: ' ' }] },
];

const SPEED = 60;

/** Everyone's avatar: theirs to move, everyone's to see, with a score the server keeps. */
const Avatar = (player: string) => {
    const self = useSelf();
    return useShared({
        owner: player,
        fields: { score: 0 },
        move: (input, dt) => {
            self.transform!.x += input.strength('left', 'right') * SPEED * dt;
            // A wall the server and the player both know.
            self.transform!.x = Math.min(self.transform!.x, wall.x);
        },
    });
};
const wall = { x: 1000 };

/** Something the server moves on its own, for everyone to watch. */
const Ball = () => useShared({ fields: { color: 'red' } });

type THooks = {
    server?: (net: TNetHandle, spawn: { avatar: (player: string) => TGameObject<TShared>; ball: () => TGameObject }) => void;
    client?: (net: TNetHandle) => void;
};

const makeArena = (hooks: THooks): TSceneFn => () => {
    const net = useNet();
    const spawnAvatar = useNetSpawn('avatar', Avatar);
    const spawnBall = useNetSpawn('ball', Ball);
    if (net.role === 'server') hooks.server?.(net, { avatar: spawnAvatar, ball: spawnBall });
    else hooks.client?.(net);
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
    server = createServer({ width: 160, height: 90, scenes: { Arena: makeArena(hooks) }, clock: false, step: 60, actions: ACTIONS, ...options });
    const player = (connect: (net: TNetHandle) => void = (net) => net.connect(connectLoopback(server!), { room: 'arena', interpolation: 0.05 })) => {
        let handle: TNetHandle | null = null;
        const game = createHeadlessGame({
            width: 160,
            height: 90,
            step: 60,
            actions: ACTIONS,
            scenes: {
                Arena: makeArena({
                    client: (net) => {
                        handle = net;
                        hooks.client?.(net);
                        connect(net);
                    },
                }),
            },
        });
        games.push(game);
        return { game, net: () => handle! };
    };
    return { player, room: () => server!.room('arena')! };
};

const avatarsIn = (game: { findAll(name: string): TGameObject[] }) => game.findAll('Avatar').filter((box) => !box.destroyed);

describe('nacatamalon/net: shared objects', () => {
    it('makes what the server spawns in every game, for whoever comes later too, and ends it everywhere', async () => {
        const avatars = new Map<string, TGameObject>();
        const { player, room } = start({
            server: (net, spawn) => {
                net.onJoin((who) => avatars.set(who, spawn.avatar(who)));
                net.onLeave((who) => destroy(avatars.get(who)!));
            },
        });
        const ana = player();
        await pump(4);
        expect(avatarsIn(room())).toHaveLength(1);
        expect(avatarsIn(ana.game)).toHaveLength(1);

        const luis = player();
        await pump(4);
        // The second sees both, the first arrived before them; the first sees the second come.
        expect(avatarsIn(ana.game)).toHaveLength(2);
        expect(avatarsIn(luis.game)).toHaveLength(2);
        expect(avatarsIn(luis.game).every((box) => box.visible)).toBe(true);

        // Luis goes: his avatar goes from Ana's game.
        luis.game.destroy();
        games.splice(games.indexOf(luis.game), 1);
        await pump(4);
        expect(avatarsIn(room())).toHaveLength(1);
        expect(avatarsIn(ana.game)).toHaveLength(1);
    });

    it('carries where a shared object is and its fields, gliding, to every player', async () => {
        let ball: TGameObject | null = null;
        const { player } = start({
            server: (net, spawn) => {
                net.onJoin(() => {
                    ball ??= spawn.ball();
                });
                useUpdate(() => {
                    if (ball === null) return;
                    ball.transform!.x += 2;
                });
            },
        });
        const ana = player();
        await pump(3);
        const seen: number[] = [];
        for (let i = 0; i < 20; i++) {
            await pump(1);
            seen.push(ana.game.find('Ball')!.transform!.x);
        }
        // It moves, never back, and a little behind where the server has it.
        expect(seen.at(-1)!).toBeGreaterThan(seen[0]);
        for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
        expect(seen.at(-1)!).toBeLessThan(ball!.transform!.x);
        // Not only the steps the server sent: between them too.
        expect(seen.some((x) => x % 2 !== 0)).toBe(true);

        // A field the server changes reaches the player.
        useSharedFieldsOf(ball!).color = 'blue';
        await pump(10);
        expect(useSharedFieldsOf(ana.game.find('Ball')!).color).toBe('blue');
    });

    it('moves a player\'s own object at once in their page, and the server agrees', async () => {
        const avatars = new Map<string, TGameObject>();
        const { player, room } = start({
            server: (net, spawn) => {
                net.onJoin((who) => avatars.set(who, spawn.avatar(who)));
            },
        });
        const ana = player();
        await pump(6);
        const mine = () => avatarsIn(ana.game)[0];
        expect(mine().transform!.x).toBe(0);

        // Pressed: the page moves it in that very step, before the server has heard of it.
        ana.game.press('ArrowRight');
        await settle();
        ana.game.run(1);
        expect(mine().transform!.x).toBeCloseTo(1, 5);
        expect(avatarsIn(room())[0].transform!.x).toBe(0);

        for (let i = 0; i < 29; i++) {
            await settle();
            ana.game.run(1);
            room().step(1);
        }
        ana.game.release('ArrowRight');
        await pump(10);
        // Thirty steps right, on both sides: the server ran the same steps the page did.
        expect(avatarsIn(room())[0].transform!.x).toBeCloseTo(30, 5);
        expect(mine().transform!.x).toBeCloseTo(30, 5);
    });

    it('takes the server\'s word when the page guessed wrong', async () => {
        const avatars = new Map<string, TGameObject>();
        const { player, room } = start({
            server: (net, spawn) => {
                net.onJoin((who) => avatars.set(who, spawn.avatar(who)));
            },
        });
        const ana = player();
        await pump(6);
        const mine = () => avatarsIn(ana.game)[0];

        // The server alone knows of a wall at 10.
        const step = async () => {
            await settle();
            ana.game.run(1);
            wall.x = 10;
            room().step(1);
            wall.x = 1000;
        };
        ana.game.press('ArrowRight');
        for (let i = 0; i < 30; i++) await step();
        ana.game.release('ArrowRight');
        for (let i = 0; i < 10; i++) await step();
        expect(avatarsIn(room())[0].transform!.x).toBeCloseTo(10, 5);
        expect(mine().transform!.x).toBeCloseTo(10, 5);
    });

    it('gives the server each player\'s actions, and looks back to where a player saw things', async () => {
        const pressed: string[] = [];
        let ball: TGameObject | null = null;
        let seenAt: number | null = null;
        const { player } = start({
            server: (net, spawn) => {
                net.onJoin(() => {
                    ball ??= spawn.ball();
                });
                useUpdate(() => {
                    if (ball !== null) ball.transform!.x += 3;
                    for (const who of net.players) {
                        if (net.actions(who).justPressed('fire')) {
                            pressed.push(who);
                            seenAt = net.rewind(who, () => ball!.transform!.x);
                        }
                    }
                });
            },
        });
        const ana = player();
        await pump(20);
        const shown = ana.game.find('Ball')!.transform!.x;
        ana.game.tap(' ');
        await pump(3);
        expect(pressed).toEqual(['player-1']);
        // Where Ana saw the ball when she fired, not where the server has it now.
        expect(seenAt).not.toBeNull();
        expect(Math.abs(seenAt! - shown)).toBeLessThanOrEqual(9);
        expect(seenAt!).toBeLessThan(ball!.transform!.x);
        // And put back.
        expect(ball!.transform!.x % 3).toBe(0);
    });

    it('matches what both sides build by its key, and measures the ping', async () => {
        const Door = () => {
            const shared = useShared({ key: 'door', fields: { open: false } });
            return shared;
        };
        let door: TShared | null = null;
        const { player } = start({
            server: (net) => {
                door = useSpawnKeyed(Door);
                net.onMessage('knock', () => {
                    door!.fields.open = true;
                });
            },
            client: () => {
                useSpawnKeyed(Door);
            },
        });
        const ana = player();
        await pump(70);
        ana.net().send('knock');
        await pump(10);
        expect((ana.game.find('Door')!.api as TShared).fields.open).toBe(true);
        expect(ana.net().ping).not.toBeNull();
    });

    it('runs a player\'s own steps once each when they arrive bunched, so page and server agree', async () => {
        const avatars = new Map<string, TGameObject>();
        const { player, room } = start({
            server: (net, spawn) => {
                net.onJoin((who) => avatars.set(who, spawn.avatar(who)));
            },
        });
        const ana = player();
        await pump(6);
        ana.game.press('ArrowRight');
        // Six of the page's steps reach the server at once.
        for (let i = 0; i < 6; i++) {
            await settle();
            ana.game.run(1);
        }
        await settle();
        for (let i = 0; i < 20; i++) {
            await settle();
            ana.game.run(1);
            room().step(1);
        }
        ana.game.release('ArrowRight');
        for (let i = 0; i < 15; i++) {
            await settle();
            ana.game.run(1);
            room().step(1);
        }
        const server = avatarsIn(room())[0].transform!.x;
        expect(server).toBeCloseTo(26, 5);
        expect(avatarsIn(ana.game)[0].transform!.x).toBeCloseTo(server, 5);
    });

    it('lets go of a held action on the server once it is let go, and only then', async () => {
        const held: number[] = [];
        const down: boolean[] = [];
        let avatar: TGameObject | null = null;
        let serverNet: TNetHandle | null = null;
        const { player } = start({
            server: (net, spawn) => {
                serverNet = net;
                net.onJoin((who) => {
                    avatar = spawn.avatar(who);
                });
                net.onMessage('drop', () => destroy(avatar!));
                useUpdate(() => {
                    const who = net.players[0];
                    if (who === undefined) return;
                    held.push(net.actions(who).heldFor('fire'));
                    down.push(net.actions(who).isDown('fire'));
                });
            },
        });
        const ana = player();
        await pump(6);
        ana.game.press(' ');
        await pump(10);
        ana.game.release(' ');
        await pump(6);
        expect(held.at(-1)).toBe(0);
        expect(down.at(-1)).toBe(false);

        // Held while the page stops sending every step (its own object gone): still held.
        ana.game.press('ArrowRight');
        await pump(4);
        ana.net().send('drop');
        await pump(20);
        const net = serverNet!;
        expect(net.actions(net.players[0]!).isDown('right')).toBe(true);
    });

    it('makes what the server made before this page had the spawner, once it has it', async () => {
        let ball: TGameObject | null = null;
        const Later = () => {
            useNetSpawn('late', Ball);
        };
        const { player } = start({
            server: (net) => {
                const spawnLate = useNetSpawn('late', Ball);
                net.onJoin(() => {
                    ball ??= spawnLate();
                });
            },
            client: () => {
                let frames = 0;
                const spawnLater = useSpawn(Later, 'Later');
                useUpdate(() => {
                    frames += 1;
                    if (frames === 20) spawnLater();
                });
            },
        });
        const ana = player();
        await pump(10);
        expect(ball).not.toBeNull();
        expect(ana.game.findAll('Ball').filter((box) => !box.destroyed)).toHaveLength(0);
        // Changed while it waited: the page gets the new value, not the one it was made with.
        useSharedFieldsOf(ball!).color = 'blue';
        await pump(20);
        const late = ana.game.findAll('Ball').filter((box) => !box.destroyed);
        expect(late).toHaveLength(1);
        expect(useSharedFieldsOf(late[0]!).color).toBe('blue');
    });

    it('moves a player as fast as their own steps say, on a server of fewer steps a second', async () => {
        const avatars = new Map<string, TGameObject>();
        const { player, room } = start({
            server: (net, spawn) => {
                net.onJoin((who) => avatars.set(who, spawn.avatar(who)));
            },
        }, { step: 20 });
        const ana = player();
        await pump(6);
        ana.game.press('ArrowRight');
        // A second of the page (60 steps) against a second of the server (20).
        for (let i = 0; i < 60; i++) {
            await settle();
            ana.game.run(1);
            if (i % 3 === 2) room().step(1);
        }
        ana.game.release('ArrowRight');
        for (let i = 0; i < 30; i++) {
            await settle();
            ana.game.run(1);
            if (i % 3 === 2) room().step(1);
        }
        // 60 px a second for a second, on both sides.
        expect(avatarsIn(room())[0].transform!.x).toBeCloseTo(60, 3);
        expect(avatarsIn(ana.game)[0].transform!.x).toBeCloseTo(60, 3);
    });

    it('runs no more of a player\'s steps than time went by, however many they send', async () => {
        const avatars = new Map<string, TGameObject>();
        const { room } = start({
            server: (net, spawn) => {
                net.onJoin((who) => avatars.set(who, spawn.avatar(who)));
            },
        });
        // A changed game: it says hello, then floods the server with steps held right.
        const line = connectLoopback(server!);
        line.onMessage(() => {});
        line.onClose(() => {});
        line.send(JSON.stringify({ k: 'hello', v: 1, room: 'arena', token: null }));
        await settle();
        let seq = 0;
        for (let step = 0; step < 10; step++) {
            for (let i = 0; i < 50; i++) {
                seq += 1;
                line.send(JSON.stringify({ k: 'in', s: seq, t: 0, d: 1 / 60, e: 1, v: { right: 1 } }));
            }
            await settle();
            room().step(1);
        }
        // Ten steps of the server are ten of the player's, and a quarter second it may catch up: never 500.
        const x = avatarsIn(room())[0]!.transform!.x;
        expect(x).toBeGreaterThan(5);
        expect(x).toBeLessThanOrEqual(10 + 15 + 1e-6);
        line.close();
    });

    it('runs nothing of a player while their steps are late, and all of them when they come', async () => {
        const avatars = new Map<string, TGameObject>();
        const { player, room } = start({
            server: (net, spawn) => {
                net.onJoin((who) => avatars.set(who, spawn.avatar(who)));
            },
        });
        const ana = player();
        await pump(6);
        ana.game.press('ArrowRight');
        let pressedSteps = 0;
        for (let round = 0; round < 5; round++) {
            // The page hiccups: the server goes on three steps with nothing from it.
            for (let i = 0; i < 3; i++) {
                await settle();
                room().step(1);
            }
            for (let i = 0; i < 3; i++) {
                await settle();
                ana.game.run(1);
                pressedSteps += 1;
            }
        }
        ana.game.release('ArrowRight');
        for (let i = 0; i < 20; i++) {
            await settle();
            ana.game.run(1);
            room().step(1);
        }
        expect(avatarsIn(room())[0].transform!.x).toBeCloseTo(pressedSteps, 3);
        expect(avatarsIn(ana.game)[0].transform!.x).toBeCloseTo(pressedSteps, 3);
    });

    it('keeps a player at most a quarter of a second ahead of a server that runs slower than them', async () => {
        const avatars = new Map<string, TGameObject>();
        const { player, room } = start({
            server: (net, spawn) => {
                net.onJoin((who) => avatars.set(who, spawn.avatar(who)));
            },
        });
        const ana = player();
        await pump(6);
        ana.game.press('ArrowRight');
        // Three seconds of the page against two and a half of the server: 50 steps a second for 60.
        for (let i = 0; i < 180; i++) {
            await settle();
            ana.game.run(1);
            if (i % 6 !== 5) room().step(1);
        }
        const server = avatarsIn(room())[0].transform!.x;
        const page = avatarsIn(ana.game)[0].transform!.x;
        // Ahead by what still waits, never more than a quarter of a second of it (15 px at 60 px/s),
        // and the step on its way. Without the bound it would be 30 here, and growing.
        expect(page - server).toBeLessThanOrEqual(17 + 1e-6);
        expect(page - server).toBeGreaterThanOrEqual(0);
    });

    it('shows the others only as far behind as the line needs, when the game leaves it to the line', async () => {
        let ball: TGameObject | null = null;
        const { player } = start({
            server: (net, spawn) => {
                net.onJoin(() => {
                    ball ??= spawn.ball();
                });
                useUpdate(() => {
                    if (ball !== null) ball.transform!.x += 2;
                });
            },
        });
        // No interpolation given: it starts at 0.1 s behind and settles on what this line asks.
        const ana = player((net) => net.connect(connectLoopback(server!), { room: 'arena' }));
        await pump(240);
        const behind = ball!.transform!.x - ana.game.find('Ball')!.transform!.x;
        // At 2 px a step, 0.1 s behind would be 12 px; a steady line in memory needs about one send.
        expect(behind).toBeGreaterThan(0);
        expect(behind).toBeLessThan(8);
    });

    it('takes a field out in every game when the server takes it out, for whoever comes later too', async () => {
        let ball: TGameObject | null = null;
        const { player } = start({
            server: (net, spawn) => {
                net.onJoin(() => {
                    ball ??= spawn.ball();
                });
            },
        });
        const ana = player();
        await pump(10);
        const fields = useSharedFieldsOf(ball!);
        fields.equipped = 'sword';
        await pump(10);
        expect(useSharedFieldsOf(ana.game.find('Ball')!).equipped).toBe('sword');
        delete fields.equipped;
        delete fields.color;
        await pump(10);
        expect(Object.keys(useSharedFieldsOf(ana.game.find('Ball')!))).toEqual([]);
        // One who comes now has none of them either, not even the one its body starts with.
        const luis = player();
        await pump(10);
        expect(Object.keys(useSharedFieldsOf(luis.game.find('Ball')!))).toEqual([]);
    });

    it('never looks further back than the room allows, whatever a player says it saw', async () => {
        let ball: TGameObject | null = null;
        let seenAt: number | null = null;
        const { room } = start({
            server: (net, spawn) => {
                ball = spawn.ball();
                useUpdate(() => {
                    ball!.transform!.x += 3;
                    for (const who of net.players) {
                        if (net.actions(who).justPressed('fire')) seenAt = net.rewind(who, () => ball!.transform!.x);
                    }
                });
            },
        });
        await pump(90);
        // A changed game: it says it was looking at the very start of the room, and fires.
        const line = connectLoopback(server!);
        line.onMessage(() => {});
        line.onClose(() => {});
        line.send(JSON.stringify({ k: 'hello', v: 1, room: 'arena', token: null }));
        await settle();
        line.send(JSON.stringify({ k: 'in', s: 1, t: 0, d: 1 / 60, e: 0, v: { fire: 1 }, p: ['fire'] }));
        await settle();
        room().step(1);
        expect(seenAt).not.toBeNull();
        // At most a quarter of a second back: 15 steps of 3 px.
        expect(ball!.transform!.x - seenAt!).toBeLessThanOrEqual(15 * 3 + 3);
        line.close();
    });

    it('says clearly what only the server may do, and what a shared object needs', async () => {
        let thrown = '';
        const { player } = start({
            client: (net) => {
                try {
                    useShared();
                } catch (error) {
                    thrown += (error as Error).message;
                }
                expect(() => net.actions('x')).toThrow('only the server');
            },
        });
        player();
        expect(thrown).toContain('needs a key');
    });
});

/** The fields of a shared object, through the api its body returned. */
const useSharedFieldsOf = (box: TGameObject) => {
    const api = box.api as TShared | undefined;
    if (api?.fields !== undefined) return api.fields as Record<string, unknown>;
    throw new Error('not shared through its api');
};

/** Spawns a component that shares itself by key, under the scene, in the scene's body. */
const useSpawnKeyed = (component: () => TShared): TShared => useSpawn(component, 'Door')().api;
