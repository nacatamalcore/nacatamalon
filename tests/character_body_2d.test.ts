import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createTilemap } from '../src/gameobjects/tilemap/create_tilemap';
import { setTile } from '../src/gameobjects/tilemap/tile_queries';
import { whenLoaded } from '../src/loaders';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useUpdate } from '../src/hooks/loop/use_update';
import { usePhysicsBody2d, usePhysicsWorld2d } from '../src/hooks/physics';
import { registerPhysicsProvider } from '../src/physics';
import { getPhysicsWorld2d, rapier2dProvider } from '../src/physics/rapier2d/provider';
import { useSelf } from '../src/hooks/spawn/use_self';
import { destroy } from '../src/destroy/destroy';
import { loadRapier2D } from '../src/physics/rapier2d/load_rapier';
import { useCharacterBody2d } from '../src/physics/rapier2d/use_character_body_2d';
import { useTileBody2d } from '../src/physics/character/use_tile_body_2d';
import { createTestGame, startTestScene } from './helpers/test_game';
import { serveTilemap } from './helpers/test_tilemap';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TTilemap } from '../src/gameobjects/tilemap/types/t_tilemap';
import type { TCharacterBody2d, TCharacterShape2d } from '../src/physics/character/t_character_body_2d';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';

/**
 * A platformer's character and the map it walks on. Both characters, the one in the 2D world and
 * the one on the maps alone, pass the same tests: moved by the game, stopped by walls, held by ledges
 * and slopes, climbing ladders. In the world, the map's tiles are its walls too, and what the
 * simulation moves (a crate) lands on the map and is pushed by the character.
 *
 * Every map here is drawn as text, a character a cell of 16 pixels: `#` a wall, `-` a ledge, `/` a
 * slope up to the right, `d` one down to the right, `H` a ladder, `T` a ladder's top (a ladder and a
 * ledge), `^` spikes, `>` a belt, `i` ice.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const CELL = 16;

const TILES = {
    1: { frame: 0, solid: true },
    2: { frame: 0, oneWay: true },
    3: { frame: 0, slope: [0, 1] },
    4: { frame: 0, ladder: true },
    5: { frame: 0, solid: true, damage: 3 },
    6: { frame: 0, solid: true, push: { x: 60, y: 0 } },
    7: { frame: 0, solid: true, props: { ice: true } },
    8: { frame: 0, slope: [1, 0] },
    9: { frame: 0, ladder: true, oneWay: true },
};
const IDS: Record<string, number> = { ' ': 0, '#': 1, '-': 2, '/': 3, 'H': 4, '^': 5, '>': 6, 'i': 7, 'd': 8, 'T': 9 };

const docOf = (rows: string[]) => ({
    format: 1, kind: 'tilemap', atlas: 'tiles.atlas', cell: CELL, width: rows[0].length, height: rows.length,
    tiles: TILES,
    layers: [{ name: 'ground', order: 0, data: rows.join('').split('').map((c) => IDS[c]) }],
});

let served: ReturnType<typeof serveTilemap> | null = null;

beforeAll(async () => {
    await loadRapier2D();
});

afterEach(() => {
    served?.restore();
    served = null;
    registerPhysicsProvider(null);
});

/**
 * The two characters a platformer can have, which have to pass the same tests: one in the 2D world,
 * one on the maps alone.
 */
const KINDS = [
    { name: 'useCharacterBody2d', make: useCharacterBody2d, physics: true },
    { name: 'useTileBody2d', make: useTileBody2d, physics: false },
];
let body: (typeof KINDS)[number] = KINDS[0];

/**
 * A level: the map drawn by `rows`, a 2D world, whatever `body` adds, and frames of exactly 1/60.
 */
const level = async (rows: string[], build: () => void) => {
    served = serveTilemap(docOf(rows));
    if (body.physics) registerPhysicsProvider(rapier2dProvider);
    const { store } = createTestGame({ step: 60 });
    const ctx = createFrameContext();
    let map!: TTilemap;
    registerScene(store, 'Level', () => {
        if (body.physics) usePhysicsWorld2d();
        map = createTilemap({ src: '/maps/level.tilemap' });
        build();
        return createScene();
    });
    startScene(store, 'Level');
    await whenLoaded(map);
    await new Promise((resolve) => setTimeout(resolve, 0));
    let now = 0;
    const frames = (count: number): void => {
        for (let i = 0; i < count; i++) {
            const prev = now;
            now += 1000 / 60;
            tick(store, ctx, now, prev);
        }
    };
    return { map, frames };
};

/**
 * A hero 12 wide and 24 tall at a point, driven every frame by `drive`.
 */
const hero = (x: number, y: number, drive: (body: TCharacterBody2d) => void = () => {}, options: Partial<TCharacterShape2d> = {}) => {
    const out = { sprite: null as unknown as TSprite, body: null as unknown as TCharacterBody2d, object: null as unknown as TGameObject };
    out.object = useSpawn(function Hero() {
        out.sprite = createSprite({ width: 12, height: 24, tint, transform: at(x, y) });
        out.body = body.make({ width: 12, height: 24, ...options });
        useUpdate(() => drive(out.body));
    })();
    return out;
};

const crate = (x: number, y: number, vy = 0) => {
    const out = { sprite: null as unknown as TSprite };
    useSpawn(function Crate() {
        out.sprite = createSprite({ width: 16, height: 16, tint, transform: at(x, y) });
        usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 16, height: 16 } });
        if (vy !== 0) getPhysicsWorld2d()?.bodyOf(useSelf())?.setLinearVelocity(0, vy);
    })();
    return out;
};

const ROOM = [
    '          ',
    '          ',
    '          ',
    '          ',
    '          ',
    '##########',
];

const LEDGE = [
    '          ',
    '          ',
    '          ',
    '----------',
    '          ',
    '##########',
];

for (const kind of KINDS) {
    describe(kind.name, () => {
        beforeEach(() => { body = kind; });

        describe('a character on a map', () => {
            it('falls and stands on the floor', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level(ROOM, () => { h = hero(40, 20); });

                frames(90);

                expect(h.body.onGround).toBe(true);
                expect(h.sprite.transform.y).toBeCloseTo(80 - 12, 0);
                expect(h.body.velocity.y).toBe(0);
            });

            it('moves the frame its speed is set, not the one after', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level(ROOM, () => { h = hero(40, 68, (b) => { b.velocity.x = 60; }); });
                frames(30);
                const before = h.sprite.transform.x;

                frames(1);

                expect(h.sprite.transform.x - before).toBeCloseTo(1, 3);
            });

            it('walks the same distance every frame, standing on the floor', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level(ROOM, () => { h = hero(24, 68, (b) => { b.velocity.x = 60; }); });
                frames(20);
                const steps: number[] = [];
                for (let i = 0; i < 60; i++) {
                    const x = h.sprite.transform.x;
                    frames(1);
                    steps.push(Math.round((h.sprite.transform.x - x) * 100) / 100);
                }

                expect(new Set(steps)).toEqual(new Set([1]));
            });

            it('walks off an edge and falls, rather than staying stuck to the floor it left', async () => {
                let h!: ReturnType<typeof hero>;
                const air: boolean[] = [];
                const { frames } = await level([
                    '          ',
                    '          ',
                    '          ',
                    '####      ',
                    '          ',
                    '##########',
                ], () => { h = hero(40, 36, (b) => { b.velocity.x = 60; air.push(!b.onGround); }); });

                frames(120);

                expect(air).toContain(true);
                expect(h.sprite.transform.y).toBeCloseTo(80 - 12, 0);
                expect(h.body.onGround).toBe(true);
            });

            it('stays on a slope walking down it', async () => {
                let h!: ReturnType<typeof hero>;
                const grounded: boolean[] = [];
                let watching = false;
                const { frames } = await level([
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '####d     ',
                    '##########',
                ], () => {
                    h = hero(40, 52, (b) => { b.velocity.x = watching ? 40 : 0; grounded.push(b.onGround); });
                });
                frames(20);
                watching = true;
                grounded.length = 0;
                frames(90);

                // Past the slope (64 to 80) and on the floor below it, without leaving the ground once.
                expect(h.sprite.transform.x).toBeGreaterThan(90);
                expect(h.sprite.transform.y).toBeCloseTo(80 - 12, 0);
                expect(grounded.slice(1).every(Boolean)).toBe(true);
            });

            it('falls faster than a tile a frame onto a floor one tile thick, and stands on it', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level([
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '##########',
                    '          ',
                ], () => { h = hero(40, -400, () => {}, { gravity: 20000, maxFall: 2400 }); });

                frames(60);

                expect(h.sprite.transform.y).toBeCloseTo(128 - 12, 0);
                expect(h.body.onGround).toBe(true);
            });

            it('runs faster than a tile a frame into a wall one tile thick, and stops at it', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level([
                    '          ',
                    '          ',
                    '          ',
                    '      #   ',
                    '      #   ',
                    '##########',
                ], () => { h = hero(24, 68, (b) => { b.velocity.x = 2400; }); });

                frames(10);

                expect(h.sprite.transform.x).toBeCloseTo(96 - 6, 0);
                expect(h.body.onWall).toBe('right');
            });

            it('stops at a wall, and says which side it is on', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level([
                    '          ',
                    '          ',
                    '          ',
                    '       #  ',
                    '       #  ',
                    '##########',
                ], () => { h = hero(40, 68, (b) => { b.velocity.x = 120; }); });

                frames(90);

                expect(h.body.onWall).toBe('right');
                expect(h.sprite.transform.x).toBeCloseTo(112 - 6, 0);
            });

            it('hits its head on a ceiling and comes back down', async () => {
                const ceilings: boolean[] = [];
                let h!: ReturnType<typeof hero>;
                let jumped = false;
                const { frames } = await level([
                    '          ',
                    '##########',
                    '          ',
                    '          ',
                    '          ',
                    '##########',
                ], () => {
                    h = hero(40, 68, (b) => {
                        if (b.onGround && !jumped) { b.velocity.y = -400; jumped = true; }
                        ceilings.push(b.onCeiling);
                    });
                });

                frames(120);

                expect(ceilings).toContain(true);
                expect(h.body.onGround).toBe(true);
                // The ceiling's underside is at 32: the head never went past it.
                expect(h.sprite.transform.y).toBeCloseTo(68, 0);
            });

            it('walks up a slope onto the higher floor', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level([
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '     /####',
                    '##########',
                ], () => { h = hero(24, 68, (b) => { b.velocity.x = 60; }); });

                // About a hundred pixels: up the slope and onto the higher floor, short of the map's end.
                frames(110);

                expect(h.sprite.transform.x).toBeGreaterThan(110);
                expect(h.sprite.transform.y).toBeCloseTo(64 - 12, 0);
                expect(h.body.onGround).toBe(true);
            });
        });

        describe('a ledge', () => {

            it('holds what lands on it, and lets it drop through when asked', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level(LEDGE, () => { h = hero(40, 10); });

                frames(60);
                expect(h.body.onOneWay).toBe(true);
                expect(h.sprite.transform.y).toBeCloseTo(48 - 12, 0);

                h.body.dropThrough();
                frames(60);
                expect(h.body.onOneWay).toBe(false);
                expect(h.sprite.transform.y).toBeCloseTo(80 - 12, 0);
            });

            it('is jumped through from below, and landed on from above', async () => {
                let h!: ReturnType<typeof hero>;
                let jumped = false;
                let highest = Infinity;
                const { frames } = await level(LEDGE, () => {
                    h = hero(40, 68, (b) => {
                        if (b.onGround && !jumped) { b.velocity.y = -380; jumped = true; }
                    });
                });

                for (let i = 0; i < 120; i++) {
                    frames(1);
                    highest = Math.min(highest, h.sprite.transform.y);
                }

                expect(highest).toBeLessThan(36);
                expect(h.body.onOneWay).toBe(true);
                expect(h.sprite.transform.y).toBeCloseTo(36, 0);
            });

        });

        describe('a ladder', () => {
            it('is climbed with no gravity, and let go of at its top', async () => {
                let h!: ReturnType<typeof hero>;
                let climb = false;
                const { frames } = await level([
                    '          ',
                    '    H     ',
                    '    H     ',
                    '    H     ',
                    '    H     ',
                    '##########',
                ], () => {
                    h = hero(72, 68, (b) => {
                        if (climb && b.onLadder) { b.climbing = true; }
                        if (b.climbing) b.velocity.y = -60;
                    });
                });

                frames(10);
                expect(h.body.onLadder).toBe(true);
                expect(h.body.climbing).toBe(false);

                climb = true;
                frames(30);
                expect(h.body.climbing).toBe(true);
                expect(h.sprite.transform.y).toBeLessThan(68 - 25);

                climb = false;
                frames(120);
                // Past the top it is off the ladder, not climbing, and has fallen back to the floor.
                expect(h.body.climbing).toBe(false);
            });
        });

        describe('the top of a ladder', () => {
            it('is climbed out of, and stood on', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level([
                    '          ',
                    '          ',
                    '    T     ',
                    '    H     ',
                    '    H     ',
                    '##########',
                ], () => {
                    h = hero(72, 68, (b) => {
                        // Up, held the whole time, the way a player holds it, but only from below.
                        if (b.onLadder && !b.onOneWay) b.climbing = true;
                        if (b.climbing) b.velocity.y = -60;
                    });
                });

                frames(120);

                expect(h.body.climbing).toBe(false);
                expect(h.body.onOneWay).toBe(true);
                expect(h.sprite.transform.y).toBeCloseTo(32 - 12, 0);
            });

            it('is stood on, and climbed down through', async () => {
                let h!: ReturnType<typeof hero>;
                let down = false;
                const { frames } = await level([
                    '          ',
                    '          ',
                    '    T     ',
                    '    H     ',
                    '    H     ',
                    '##########',
                ], () => {
                    h = hero(72, 10, (b) => {
                        if (down && b.onLadder) b.climbing = true;
                        if (b.climbing) b.velocity.y = 60;
                    });
                });

                frames(60);
                expect(h.body.onOneWay).toBe(true);
                expect(h.body.onLadder).toBe(true);
                expect(h.sprite.transform.y).toBeCloseTo(32 - 12, 0);

                down = true;
                frames(20);
                expect(h.body.climbing).toBe(true);
                expect(h.sprite.transform.y).toBeGreaterThan(32);
            });
        });

        describe('what the tiles say', () => {
            it('reports harm from spikes underfoot, and the tile it stands on', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level([
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '##^^iiii##',
                ], () => { h = hero(40, 60); });

                frames(60);
                expect(h.body.damage).toBe(3);
                expect(h.body.ground?.damage).toBe(3);
            });

            it('reads the props of the tile underfoot', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level([
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    'iiiiiiiiii',
                ], () => { h = hero(40, 60); });

                frames(60);
                expect(h.body.ground?.props).toEqual({ ice: true });
                expect(h.body.damage).toBe(0);
            });

            it('is carried along by a belt', async () => {
                let h!: ReturnType<typeof hero>;
                const { frames } = await level([
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '          ',
                    '>>>>>>>>>>',
                ], () => { h = hero(24, 60); });

                frames(30);
                const before = h.sprite.transform.x;
                frames(60);

                expect(h.sprite.transform.x - before).toBeCloseTo(60, -1);
            });
        });
    });
}

describe('the map in the world', () => {
    beforeEach(() => { body = KINDS[0]; });

    it('holds a crate falling onto it', async () => {
        let falling!: ReturnType<typeof crate>;
        const { frames } = await level(LEDGE, () => { falling = crate(40, 10); });

        frames(90);

        expect(falling.sprite.transform.y).toBeCloseTo(48 - 8, 0);
    });

    it('lets a crate thrown up from below through, and holds it when it comes down', async () => {
        let thrown!: ReturnType<typeof crate>;
        let highest = Infinity;
        const { frames } = await level(LEDGE, () => { thrown = crate(40, 72, -420); });

        for (let i = 0; i < 120; i++) {
            frames(1);
            highest = Math.min(highest, thrown.sprite.transform.y);
        }

        expect(highest).toBeLessThan(40);
        expect(thrown.sprite.transform.y).toBeCloseTo(48 - 8, 0);
    });

    it('holds a crate on its floor, and lets it fall once the floor is broken', async () => {
        let box!: ReturnType<typeof crate>;
        const { map, frames } = await level(ROOM, () => { box = crate(40, 20); });

        frames(90);
        expect(box.sprite.transform.y).toBeCloseTo(80 - 8, 0);

        for (let column = 0; column < 10; column++) setTile(map, 0, column, 5, 0);
        frames(30);
        expect(box.sprite.transform.y).toBeGreaterThan(100);
    });

    it('lets the character push a crate along the floor', async () => {
        let box!: ReturnType<typeof crate>;
        const { frames } = await level(ROOM, () => {
            hero(40, 68, (b) => { b.velocity.x = 60; });
            box = crate(70, 72);
        });

        frames(120);

        expect(box.sprite.transform.x).toBeGreaterThan(90);
    });
});

describe('the map and the character, placed and taken away', () => {
    beforeEach(() => { body = KINDS[0]; });

    it('builds the map where it is drawn, moved', async () => {
        served = serveTilemap(docOf(ROOM));
        registerPhysicsProvider(rapier2dProvider);
        const { store } = createTestGame({ step: 60 });
        const ctx = createFrameContext();
        let map!: TTilemap;
        let h!: ReturnType<typeof hero>;
        registerScene(store, 'Level', () => {
            usePhysicsWorld2d();
            map = createTilemap({ src: '/maps/level.tilemap', transform: { x: 100, y: 40 } });
            h = hero(140, 60);
            return createScene();
        });
        startScene(store, 'Level');
        await whenLoaded(map);
        await new Promise((resolve) => setTimeout(resolve, 0));
        for (let i = 1; i <= 90; i++) tick(store, ctx, (i * 1000) / 60, ((i - 1) * 1000) / 60);

        expect(h.sprite.transform.y).toBeCloseTo(40 + 80 - 12, 0);
    });

    it('is a character that never moves where nothing simulates, and says so only when something should', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        let h!: ReturnType<typeof hero>;
        const { store } = createTestGame();
        startTestScene(store, 'Level', () => { h = hero(40, 20, (b) => { b.velocity.x = 60; }); return createScene(); });
        expect(h.body.onGround).toBe(false);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('leaves the world with its object: what stood on it falls', async () => {
        let h!: ReturnType<typeof hero>;
        let box!: ReturnType<typeof crate>;
        let heroObject!: TGameObject;
        const { frames } = await level(ROOM, () => {
            h = hero(40, 68);
            heroObject = h.object;
            box = crate(40, 30);
        });
        frames(60);
        expect(box.sprite.transform.y).toBeCloseTo(56 - 8, 0);

        destroy(heroObject);
        frames(60);
        expect(box.sprite.transform.y).toBeCloseTo(80 - 8, 0);
    });
});
