import { afterEach, describe, expect, it } from 'bun:test';
import { createFrameContext } from '../src/game/loop/create_frame_context';
import { tick } from '../src/game/loop/tick';
import { createScene } from '../src/scene/create_scene';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { createTilemap } from '../src/gameobjects/tilemap/create_tilemap';
import { whenLoaded } from '../src/loaders';
import { setTile, tileAt } from '../src/gameobjects/tilemap/tile_queries';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useRetroBody2d, useRetroWorld2d } from '../src/hooks/physics';
import { registerPhysicsProvider } from '../src/physics';
import { castRetroRay2d, getRetroBody2d, retroPhysics2dProvider } from '../src/physics/retro2d/provider';
import { useTileBody2d } from '../src/physics/character/use_tile_body_2d';
import { createTestGame } from './helpers/test_game';
import { serveTilemap } from './helpers/test_tilemap';
import type { TSprite } from '../src/gameobjects/sprite/types/t_sprite';
import type { TTilemap } from '../src/gameobjects/tilemap/types/t_tilemap';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TCharacterBody2d } from '../src/physics/character/t_character_body_2d';
import type { TRetroBody2dOptions } from '../src/hooks/physics/use_retro_body';
import type { TRetroBody2d } from '../src/physics';

/**
 * Retro bodies on the maps, the platformer's character among them, and rays.
 *
 * Every map is drawn as text, a character a cell of 16 pixels: `#` a wall, `-` a ledge, `/` a slope
 * up to the right, `>` a belt.
 */

(globalThis as { requestAnimationFrame?: (cb: FrameRequestCallback) => number }).requestAnimationFrame = () => 0;

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const CELL = 16;
const TILES = {
    1: { frame: 0, solid: true },
    2: { frame: 0, oneWay: true },
    3: { frame: 0, slope: [0, 1] },
    6: { frame: 0, solid: true, push: { x: 60, y: 0 } },
    7: { frame: 0, props: { coin: true } },
};
const IDS: Record<string, number> = { ' ': 0, '#': 1, '-': 2, '/': 3, '>': 6, 'o': 7 };

let served: ReturnType<typeof serveTilemap> | null = null;

afterEach(() => {
    served?.restore();
    served = null;
    registerPhysicsProvider(null);
});

const level = async (rows: string[], build: () => void, gravity = 900, rate = 60) => {
    served = serveTilemap({
        format: 1, kind: 'tilemap', atlas: 'tiles.atlas', cell: CELL, width: rows[0].length, height: rows.length,
        tiles: TILES,
        layers: [{ name: 'ground', order: 0, data: rows.join('').split('').map((c) => IDS[c]) }],
    });
    registerPhysicsProvider(retroPhysics2dProvider);
    const { store } = createTestGame({ step: 60 });
    const ctx = createFrameContext();
    let map!: TTilemap;
    registerScene(store, 'Level', () => {
        useRetroWorld2d({ gravity: { x: 0, y: gravity } });
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
            now += 1000 / rate;
            tick(store, ctx, now, prev);
        }
    };
    return { map, frames };
};

/** A retro body drawn as a plain box, and what to reach it by. */
const thing = (x: number, y: number, w: number, h: number, options: Omit<TRetroBody2dOptions, 'collider'> & { round?: boolean }) => {
    const out = { sprite: null as unknown as TSprite, object: null as unknown as TGameObject };
    out.object = useSpawn(function Thing() {
        out.sprite = createSprite({ width: w, height: h, tint, transform: at(x, y) });
        const { round, ...rest } = options;
        useRetroBody2d({ ...rest, collider: round === true ? { shape: 'circle', radius: w / 2 } : { shape: 'rect', width: w, height: h } });
    })();
    return out;
};

const hero = (x: number, y: number, drive: (body: TCharacterBody2d) => void = () => {}) => {
    const out = { sprite: null as unknown as TSprite, body: null as unknown as TCharacterBody2d };
    useSpawn(function Hero() {
        out.sprite = createSprite({ width: 12, height: 24, tint, transform: at(x, y) });
        out.body = useTileBody2d({ width: 12, height: 24 });
        useUpdate(() => drive(out.body));
    })();
    return out;
};

const FLOOR = [
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '#                  #',
    '#                  #',
    '####################',
];

describe('retro bodies on a map', () => {
    it('land on its floor and stay there', async () => {
        let crate!: ReturnType<typeof thing>;
        const { frames } = await level(FLOOR, () => { crate = thing(40, 20, 16, 16, { body: 'dynamic' }); });
        frames(120);
        expect(crate.sprite.transform.y).toBeCloseTo(144 - 8, 6);
        expect(getRetroBody2d(crate.object)!.blocked.down).toBe(true);
        frames(30);
        expect(crate.sprite.transform.y).toBeCloseTo(136, 6);
    });

    it('stop at its walls, and a fast one does not go through', async () => {
        let crate!: ReturnType<typeof thing>;
        let shot!: ReturnType<typeof thing>;
        const { frames } = await level(FLOOR, () => {
            crate = thing(100, 136, 16, 16, { body: 'dynamic' });
            shot = thing(100, 120, 4, 4, { body: 'dynamic', gravityScale: 0 });
        });
        getRetroBody2d(crate.object)!.velocity.x = 200;
        getRetroBody2d(shot.object)!.velocity.x = -20000;
        frames(60);
        // The right wall's inside is at 304, the left one's at 16.
        expect(crate.sprite.transform.x).toBeCloseTo(304 - 8, 6);
        expect(shot.sprite.transform.x).toBeCloseTo(16 + 2, 6);
    });

    it('let a body grow and shrink on their floor with its feet where they were, and out of a wall it grows into', async () => {
        let small!: TRetroBody2d;
        let wide!: TRetroBody2d;
        let hero!: TGameObject;
        let leaner!: TGameObject;
        const { frames } = await level(FLOOR, () => {
            hero = useSpawn(function Hero() {
                createSprite({ width: 12, height: 16, tint, transform: at(100, 100) });
                small = useRetroBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 12, height: 16 } });
            })();
            // Leaning on the left wall, whose inside is at 16.
            leaner = useSpawn(function Leaner() {
                createSprite({ width: 8, height: 8, tint, transform: at(20, 100) });
                wide = useRetroBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 8, height: 8 } });
            })();
        });
        const y = () => (hero.drawables[0] as TSprite).transform.y;
        frames(60);
        expect(y() + 8).toBeCloseTo(144, 6);
        small.collider = { shape: 'rect', width: 12, height: 32 };
        frames(2);
        expect(y() + 16).toBeCloseTo(144, 6);
        expect(getRetroBody2d(hero)!.blocked.down).toBe(true);
        frames(60);
        expect(y() + 16).toBeCloseTo(144, 6);
        small.collider = { shape: 'rect', width: 12, height: 16 };
        frames(2);
        expect(y() + 8).toBeCloseTo(144, 6);

        wide.collider = { shape: 'rect', width: 24, height: 24 };
        frames(30);
        const there = (leaner.drawables[0] as TSprite).transform;
        expect(there.x - 12).toBeCloseTo(16, 6);
        expect(there.y + 12).toBeCloseTo(144, 6);
    });

    it('stop a bullet at their walls at any speed', async () => {
        let shot!: ReturnType<typeof thing>;
        let back!: ReturnType<typeof thing>;
        const { frames } = await level(FLOOR, () => {
            shot = thing(100, 120, 4, 4, { body: 'dynamic', gravityScale: 0 });
            back = thing(100, 136, 4, 4, { body: 'dynamic', gravityScale: 0 });
        });
        getRetroBody2d(shot.object)!.velocity.x = -500_000;
        getRetroBody2d(back.object)!.velocity.x = 500_000;
        frames(2);
        expect(shot.sprite.transform.x).toBeCloseTo(16 + 2, 6);
        expect(back.sprite.transform.x).toBeCloseTo(304 - 2, 6);
    });

    it('land on a ledge from above, and pass up through it from below', async () => {
        const rows = [
            '          ',
            '          ',
            '          ',
            '   ----   ',
            '          ',
            '          ',
            '##########',
        ];
        let falling!: ReturnType<typeof thing>;
        let thrown!: ReturnType<typeof thing>;
        let highest = Infinity;
        const { frames } = await level(rows, () => {
            falling = thing(72, 10, 16, 16, { body: 'dynamic' });
            thrown = thing(88, 80, 16, 16, { body: 'dynamic' });
            useUpdate(() => { highest = Math.min(highest, thrown.sprite.transform.y); });
        });
        getRetroBody2d(thrown.object)!.velocity.y = -500;
        frames(120);
        expect(falling.sprite.transform.y).toBeCloseTo(48 - 8, 6);
        // Up through the ledge (its top at 48), then back down onto it.
        expect(highest).toBeLessThan(40);
        expect(thrown.sprite.transform.y).toBeCloseTo(40, 6);
    });

    it('on a slope: a crate stands, a ball rolls down it', async () => {
        const rows = [
            '          ',
            '          ',
            '          ',
            '          ',
            '#    /####',
            '##########',
        ];
        let crate!: ReturnType<typeof thing>;
        let ball!: ReturnType<typeof thing>;
        const { frames } = await level(rows, () => {
            crate = thing(88, 20, 8, 8, { body: 'dynamic' });
        });
        frames(90);
        // Stood on the slope's surface under its middle: halfway up the cell, 72 at x 88.
        expect(crate.sprite.transform.x).toBeCloseTo(88, 6);
        expect(crate.sprite.transform.y).toBeCloseTo(72 - 4, 3);

        const again = await level(rows, () => {
            ball = thing(88, 20, 8, 8, { body: 'dynamic', round: true });
        });
        again.frames(120);
        // Off the slope, down onto the flat floor to its left (top at 80), and rolling on, with
        // nothing to slow it, up to the wall (its inside at 16).
        expect(ball.sprite.transform.x).toBeCloseTo(16 + 4, 3);
        expect(ball.sprite.transform.y).toBeCloseTo(80 - 4, 3);
    });

    it('are carried by a belt they stand on', async () => {
        const rows = [
            '          ',
            '          ',
            '          ',
            '#         ',
            '#>>>>>>>>#',
        ];
        let crate!: ReturnType<typeof thing>;
        const { frames } = await level(rows, () => { crate = thing(40, 40, 16, 16, { body: 'dynamic' }); });
        frames(60);
        const x = crate.sprite.transform.x;
        frames(30);
        // 60 pixels a second.
        expect(crate.sprite.transform.x - x).toBeCloseTo(30, 0);
    });
});

describe('what review found, on the maps', () => {
    it('a ball rolls up a slope rather than through it', async () => {
        const rows = [
            '          ',
            '          ',
            '          ',
            '      /###',
            '##########',
        ];
        let ball!: ReturnType<typeof thing>;
        const { frames } = await level(rows, () => { ball = thing(40, 60, 8, 8, { body: 'dynamic', round: true }); });
        const body = getRetroBody2d(ball.object)!;
        for (let i = 0; i < 150; i++) {
            body.velocity.x = 30;
            frames(1);
        }
        // Up the slope (96 to 112 across, its surface from 64 to 48) and onto the block, never inside.
        const x = ball.sprite.transform.x;
        const surface = 64 - Math.min(16, Math.max(0, x - 96));
        expect(x).toBeGreaterThan(96);
        expect(ball.sprite.transform.y + 4).toBeLessThanOrEqual(surface + 0.01);
    });

    it('a ball past the edge of a cliff rolls off it', async () => {
        const rows = [
            '          ',
            '####      ',
            '####      ',
            '##########',
        ];
        let ball!: ReturnType<typeof thing>;
        const { frames } = await level(rows, () => { ball = thing(67, 12, 8, 8, { body: 'dynamic', round: true }); });
        frames(60);
        expect(ball.sprite.transform.y).toBeGreaterThan(30);
    });

    it('a landing is seen on one frame only, however many frames a step lasts', async () => {
        let crate!: ReturnType<typeof thing>;
        let landings = 0;
        const { frames } = await level(FLOOR, () => {
            crate = thing(40, 100, 16, 16, { body: 'dynamic' });
            useUpdate(() => {
                const body = getRetroBody2d(crate.object);
                if (body !== null && body.touching.down && !body.wasTouching.down) landings++;
            });
        }, 900, 144);
        frames(300);
        expect(landings).toBe(1);
    });
});

describe('the tiles a retro body touches', () => {
    it('are told as it starts and stops touching them, with their layer and cell', async () => {
        const rows = [
            '          ',
            '          ',
            '  o  o    ',
            '##########',
        ];
        const entered: string[] = [];
        const left: string[] = [];
        let runner!: ReturnType<typeof thing>;
        const { map, frames } = await level(rows, () => { runner = thing(8, 40, 12, 12, { body: 'dynamic' }); });
        const body = getRetroBody2d(runner.object)!;
        body.onTileEnter(({ tile, cell }) => {
            entered.push(`${cell.column},${cell.row}${tile.solid === true ? ' floor' : ''}`);
            // Coins are taken out of the map as they are touched.
            if (tile.props?.coin === true) setTile(cell.map, cell.layer, cell.column, cell.row, 0);
        });
        body.onTileExit(({ cell }) => left.push(`${cell.column},${cell.row}`));
        for (let i = 0; i < 150; i++) {
            body.velocity.x = 60;
            frames(1);
        }
        expect(entered.filter((at) => !at.endsWith('floor'))).toEqual(['2,2', '5,2']);
        expect(tileAt(map, 0, 2, 2)).toBe(0);
        expect(tileAt(map, 0, 5, 2)).toBe(0);
        // The floor it walks on is touched too, a cell at a time, and left behind.
        expect(entered.some((at) => at === '3,3 floor')).toBe(true);
        expect(left).toContain('0,3');
    });
});

describe('useTileBody2d in a retro world', () => {
    it('pushes a retro crate along the floor', async () => {
        let crate!: ReturnType<typeof thing>;
        let walker!: ReturnType<typeof hero>;
        const { frames } = await level(FLOOR, () => {
            crate = thing(120, 136, 16, 16, { body: 'dynamic' });
            walker = hero(60, 132, (body) => { body.velocity.x = 60; });
        });
        frames(120);
        expect(crate.sprite.transform.x).toBeGreaterThan(130);
        expect(walker.sprite.transform.x).toBeCloseTo(crate.sprite.transform.x - 14, 3);
        expect(walker.body.isOnGround).toBe(true);
    });

    it('rides a lift up and across', async () => {
        let lift!: ReturnType<typeof thing>;
        let rider!: ReturnType<typeof hero>;
        const { frames } = await level(FLOOR, () => {
            lift = thing(100, 120, 60, 8, { body: 'kinematic' });
            rider = hero(100, 90);
        });
        frames(60);
        // Its feet on the lift's top (116).
        expect(rider.sprite.transform.y).toBeCloseTo(116 - 12, 3);
        expect(rider.body.isOnGround).toBe(true);
        const body = getRetroBody2d(lift.object)!;
        body.velocity.x = 30;
        body.velocity.y = -30;
        frames(60);
        expect(rider.sprite.transform.x).toBeCloseTo(lift.sprite.transform.x, 0);
        expect(rider.sprite.transform.y).toBeCloseTo(lift.sprite.transform.y - 16, 0);
    });
});

describe('a retro ray', () => {
    it('meets the floor of the map from above, and the nearest body before it', async () => {
        let looker!: TGameObject;
        let crate!: ReturnType<typeof thing>;
        const { map, frames } = await level(FLOOR, () => {
            looker = useSpawn(function Looker() {
                createSprite({ width: 4, height: 4, tint, transform: at(40, 20) });
                useRetroBody2d({ body: 'static', collider: { shape: 'rect', width: 4, height: 4 } });
            })();
            crate = thing(200, 136, 16, 16, { body: 'static' });
        });
        frames(1);
        const floor = castRetroRay2d(looker, { x: 40, y: 20 }, { x: 0, y: 3 })!;
        expect(floor.object).toBeNull();
        expect(floor.cell).toEqual({ map, column: 2, row: 9 });
        expect(floor.point.y).toBeCloseTo(144, 6);
        expect(floor.normal).toEqual({ x: 0, y: -1 });
        expect(floor.distance).toBeCloseTo(124, 6);

        const onCrate = castRetroRay2d(looker, { x: 200, y: 20 }, { x: 0, y: 1 })!;
        expect(onCrate.object).toBe(crate.object);
        expect(onCrate.point.y).toBeCloseTo(128, 6);

        // Its own body, around where it starts, is not met; too short a ray meets nothing.
        expect(castRetroRay2d(looker, { x: 40, y: 20 }, { x: 0, y: 1 }, { maxDistance: 50 })).toBeNull();
        // Across, it meets the right wall's inside.
        const wall = castRetroRay2d(looker, { x: 40, y: 120 }, { x: 1, y: 0 }, { collidesWith: 0 })!;
        expect(wall.point.x).toBeCloseTo(304, 6);
        expect(wall.normal).toEqual({ x: -1, y: 0 });
        // Leaving the bodies out by their layers, it goes past the crate to the floor.
        expect(castRetroRay2d(looker, { x: 200, y: 20 }, { x: 0, y: 1 }, { collidesWith: 0 })!.object).toBeNull();
    });

    it('meets a slope along its surface, and a ledge only from above', async () => {
        const rows = [
            '          ',
            ' ---      ',
            '          ',
            '     /####',
            '##########',
        ];
        let looker!: TGameObject;
        const { frames } = await level(rows, () => {
            looker = useSpawn(function Looker() {
                useRetroBody2d({ body: 'static', sensor: true, collider: { shape: 'rect', width: 1, height: 1 } });
                createSprite({ width: 1, height: 1, tint, transform: at(0, 0) });
            })();
        });
        frames(1);
        const slope = castRetroRay2d(looker, { x: 88, y: 0 }, { x: 0, y: 1 }, { tiles: true })!;
        // The slope's surface under x 88, halfway up its cell: 56.
        expect(slope.point.y).toBeCloseTo(56, 6);
        expect(slope.normal.x).toBeCloseTo(-Math.SQRT1_2, 6);
        expect(slope.normal.y).toBeCloseTo(-Math.SQRT1_2, 6);

        expect(castRetroRay2d(looker, { x: 40, y: 0 }, { x: 0, y: 1 })!.point.y).toBeCloseTo(16, 6);
        expect(castRetroRay2d(looker, { x: 40, y: 60 }, { x: 0, y: -1 })).toBeNull();
    });

    it('meets nothing from an object outside a retro scene', async () => {
        const { store } = createTestGame();
        registerScene(store, 'Plain', () => createScene());
        const root = startScene(store, 'Plain');
        expect(castRetroRay2d(root, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
        void useSelf;
    });
});
