import { afterEach, describe, expect, it } from 'bun:test';
import { createHeadlessGame } from '../src/headless';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { registerPhysicsProvider } from '../src/physics';
import { retroPhysics2dProvider, getRetroBody2d, findRetroBodies2d, isRetroAreaFree2d } from '../src/physics/retro2d/provider';
import { useRetroBody2d, useRetroWorld2d } from '../src/hooks/physics';
import type { THeadlessGame } from '../src/headless';
import type { TSceneFn } from '../src/scene';
import type { TRetroBody2dOptions } from '../src/hooks/physics/use_retro_body';
import type { TRetroBody2d, TRetroWorld2d } from '../src/physics';
import type { TRetroContact2d, TRetroSide } from '../src/physics/retro2d/types';
import { destroy } from '../src/destroy/destroy';
import { useUpdate } from '../src/hooks/loop/use_update';

/**
 * What the retro half offers beyond moving and stopping: the world's edges, sides that let things
 * through, bodies switched off or not pushable, tests per pair, how two met, questions about a part
 * of the world, help to head somewhere, a picture that turns, and its own time.
 */

const games: THeadlessGame[] = [];

afterEach(() => {
    games.splice(0).forEach((game) => game.destroy());
    registerPhysicsProvider(null);
});

const make = (scene: TSceneFn, size = { width: 320, height: 180 }): THeadlessGame => {
    registerPhysicsProvider(retroPhysics2dProvider);
    const game = createHeadlessGame({ ...size, scenes: { Level: scene } });
    games.push(game);
    return game;
};

const records = new Map<string, TRetroBody2d>();

const thing = (name: string, x: number, y: number, w: number, h: number, options: Omit<TRetroBody2dOptions, 'collider'> & { round?: boolean }) =>
    useSpawn(function Thing() {
        createSprite({ width: w, height: h, transform: { x, y } });
        const { round, ...rest } = options;
        records.set(name, useRetroBody2d({ ...rest, collider: round === true ? { shape: 'circle', radius: w / 2 } : { shape: 'rect', width: w, height: h } }));
    }, name)();

const place = (game: THeadlessGame, name: string) => (game.find(name)!.drawables[0] as { transform: { x: number; y: number; rotation: number } }).transform;
const body = (game: THeadlessGame, name: string) => getRetroBody2d(game.find(name)!)!;

/** Runs `set` before every frame, as a held key would. */
const held = (game: THeadlessGame, frames: number, set: () => void): void => {
    for (let i = 0; i < frames; i++) {
        set();
        game.run(1);
    }
};

describe('the edges of the world', () => {
    it('stop a body that stops at them, the screen when the world gives none, and say so once', () => {
        const said: TRetroSide[] = [];
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Crate', 100, 20, 20, 20, { body: 'dynamic', bounds: 'stop' });
            return createScene();
        });
        body(game, 'Crate').onBounds((side) => said.push(side));
        game.run(120);
        expect(place(game, 'Crate').y).toBeCloseTo(170, 6);
        expect(body(game, 'Crate').blocked.down).toBe(true);
        expect(said).toEqual(['down']);
    });

    it('bring back a body that wraps by the opposite edge, every time', () => {
        const said: TRetroSide[] = [];
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 }, bounds: { x: 0, y: 0, width: 200, height: 100 } });
            thing('Ship', 190, 50, 10, 10, { body: 'dynamic', bounds: 'wrap' });
            return createScene();
        });
        body(game, 'Ship').onBounds((side) => said.push(side));
        body(game, 'Ship').velocity.x = 600;
        game.run(3);
        // Wholly past the right edge, it comes in from the left.
        expect(place(game, 'Ship').x).toBeLessThan(20);
        expect(said).toEqual(['right']);
    });
});

describe('the edges, what review found', () => {
    it('a body that wraps onto another is told once', () => {
        const told: string[] = [];
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 }, bounds: { x: 0, y: 0, width: 200, height: 100 } });
            thing('Pad', 6, 50, 10, 10, { body: 'static', sensor: true });
            thing('Ship', 190, 50, 8, 8, { body: 'dynamic', bounds: 'wrap' });
            return createScene();
        });
        body(game, 'Ship').onEnter((other) => told.push(other.name));
        body(game, 'Ship').velocity.x = 300;
        game.run(4);
        expect(told).toEqual(['Pad']);
    });

    it('a body stopped at an edge stays at it, and is told once', () => {
        const said: TRetroSide[] = [];
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 }, bounds: { x: 0, y: 0, width: 200, height: 100 } });
            thing('Crate', 100, 50, 10, 10, { body: 'dynamic', bounds: 'stop' });
            return createScene();
        });
        const crate = body(game, 'Crate');
        crate.onBounds((side) => said.push(side));
        crate.velocity.x = 600;
        game.run(20);
        expect(crate.touching.right).toBe(true);
        game.run(5);
        expect(crate.touching.right).toBe(true);
        crate.velocity.x = 600;
        game.run(5);
        expect(said).toEqual(['right']);
    });
});

describe('sides that let things through', () => {
    it('a platform solid only on top is jumped through from below and stood on from above', () => {
        let highest = Infinity;
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Floor', 160, 175, 320, 10, { body: 'static' });
            thing('Platform', 160, 100, 80, 8, { body: 'static', solidSides: { up: true, down: false, left: false, right: false } });
            thing('Hero', 160, 160, 10, 20, { body: 'dynamic' });
            return createScene();
        });
        game.run(10);
        body(game, 'Hero').velocity.y = -500;
        for (let i = 0; i < 120; i++) {
            game.run(1);
            highest = Math.min(highest, place(game, 'Hero').y);
        }
        expect(highest).toBeLessThan(86);
        // Back down onto the platform's top (96), not through it.
        expect(place(game, 'Hero').y).toBeCloseTo(96 - 10, 6);
    });
});

describe('bodies the game holds back', () => {
    it('switched off, move and stop nothing, and what touched them hears they stopped', () => {
        const told: string[] = [];
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Floor', 160, 175, 320, 10, { body: 'static' });
            thing('Crate', 100, 150, 20, 20, { body: 'dynamic' });
            return createScene();
        });
        game.run(30);
        const crate = body(game, 'Crate');
        crate.onExit((other) => told.push(other.name));
        records.get('Crate')!.enabled = false;
        // The floor goes off instead: the crate falls through where it was.
        game.run(2);
        expect(told).toEqual(['Floor']);
        records.get('Crate')!.enabled = true;
        records.get('Floor')!.enabled = false;
        game.run(30);
        expect(place(game, 'Crate').y).toBeGreaterThan(175);
    });

    it('not pushable, stand like a wall to dynamic bodies, and still give way to driven ones', () => {
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Hero', 100, 90, 10, 10, { body: 'dynamic', pushable: false });
            thing('Enemy', 60, 90, 10, 10, { body: 'dynamic' });
            thing('Wall', 30, 90, 10, 40, { body: 'kinematic' });
            return createScene();
        });
        held(game, 60, () => { body(game, 'Enemy').velocity.x = 60; });
        expect(place(game, 'Hero').x).toBeCloseTo(100, 6);
        expect(place(game, 'Enemy').x).toBeCloseTo(90, 6);
        body(game, 'Enemy').velocity.x = 0;
        body(game, 'Wall').velocity.x = 60;
        game.run(60);
        // The driven wall pushes the enemy, which cannot push the hero, which the wall then pushes too.
        expect(place(game, 'Wall').x).toBeCloseTo(90, 3);
        expect(place(game, 'Hero').x).toBeGreaterThan(100);
    });

    it('meet another only while the game says so', () => {
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Friend', 150, 90, 10, 10, { body: 'static' });
            thing('Hero', 100, 90, 10, 10, { body: 'dynamic' });
            return createScene();
        });
        const off = body(game, 'Hero').collidesIf((other) => other.name !== 'Friend');
        held(game, 60, () => { body(game, 'Hero').velocity.x = 60; });
        expect(place(game, 'Hero').x).toBeCloseTo(160, 3);
        off();
        held(game, 30, () => { body(game, 'Hero').velocity.x = -60; });
        // Stopped on the friend's right side now that the test is gone.
        expect(place(game, 'Hero').x).toBeCloseTo(160, 3);
    });
});

describe('how two bodies met', () => {
    it('is told with the side and the speed', () => {
        const told: TRetroContact2d[] = [];
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Floor', 160, 175, 320, 10, { body: 'static' });
            thing('Crate', 100, 100, 20, 20, { body: 'dynamic' });
            return createScene();
        });
        body(game, 'Crate').onEnter((_other, contact) => told.push(contact));
        body(game, 'Crate').velocity.y = 300;
        game.run(30);
        expect(told).toHaveLength(1);
        expect(told[0].side).toBe('down');
        expect(told[0].speed).toBeCloseTo(300, 6);
    });

    it('touching counts what it rests beside, blocked only what it presses', () => {
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Floor', 160, 175, 320, 10, { body: 'static' });
            thing('Wall', 50, 140, 10, 60, { body: 'static' });
            thing('Crate', 65, 160, 20, 20, { body: 'dynamic' });
            return createScene();
        });
        game.run(10);
        const crate = body(game, 'Crate');
        expect(crate.touching.left).toBe(true);
        expect(crate.blocked.left).toBe(false);
        expect(crate.touching.down).toBe(true);
        expect(crate.wasTouching.down).toBe(true);
    });
});

describe('questions about a part of the world', () => {
    it('finds the bodies in it nearest first, and says whether it is free', () => {
        let asker!: ReturnType<typeof thing>;
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            asker = thing('Asker', 10, 10, 4, 4, { body: 'static' });
            thing('Near', 100, 100, 10, 10, { body: 'static' });
            thing('Far', 130, 100, 10, 10, { body: 'static' });
            thing('Coin', 115, 100, 6, 6, { body: 'static', sensor: true });
            return createScene();
        });
        game.run(1);
        const names = (list: ReturnType<typeof findRetroBodies2d>) => list.map((found) => found.name);
        expect(names(findRetroBodies2d(asker, { x: 95, y: 100, radius: 40 }))).toEqual(['Near', 'Coin', 'Far']);
        expect(names(findRetroBodies2d(asker, { x: 90, y: 90, width: 30, height: 20 }, { sensors: false }))).toEqual(['Near']);
        expect(isRetroAreaFree2d(asker, { x: 108, y: 95, width: 14, height: 10 })).toBe(true);
        expect(isRetroAreaFree2d(asker, { x: 100, y: 100, radius: 3 })).toBe(false);
    });
});

describe('helping a body along', () => {
    it('moves towards a point and stops on it, accelerates towards one, and goes the way an angle says', () => {
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Bee', 20, 20, 6, 6, { body: 'dynamic' });
            return createScene();
        });
        const bee = body(game, 'Bee');
        held(game, 120, () => { bee.moveTowards({ x: 120, y: 80 }, 200); });
        expect(place(game, 'Bee').x).toBeCloseTo(120, 6);
        expect(place(game, 'Bee').y).toBeCloseTo(80, 6);
        expect(bee.speed).toBeCloseTo(0, 6);
        expect(bee.accelerateTowards({ x: 120, y: 180 }, 50)).toBeCloseTo(100, 6);
        expect(bee.acceleration).toEqual({ x: 0, y: 50 });
        bee.setVelocityFromAngle(Math.PI / 2, 10);
        expect(bee.velocity.x).toBeCloseTo(0, 6);
        expect(bee.velocity.y).toBeCloseTo(10, 6);
    });

    it('turns its picture and never its collider', () => {
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Floor', 160, 175, 320, 10, { body: 'static' });
            thing('Coin', 100, 150, 20, 20, { body: 'dynamic' });
            return createScene();
        });
        body(game, 'Coin').angularVelocity = Math.PI;
        game.run(60);
        expect(place(game, 'Coin').rotation).toBeCloseTo(Math.PI, 3);
        // Still resting flat on the floor, by its square collider.
        expect(place(game, 'Coin').y).toBeCloseTo(160, 6);
    });
});

describe('finer controls', () => {
    it('bounce by axis, a limit on the whole speed, and a platform that carries nothing', () => {
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Wall', 200, 90, 10, 100, { body: 'static' });
            thing('Ball', 100, 90, 8, 8, { body: 'dynamic', bounce: { x: 1, y: 0 }, round: true });
            thing('Rocket', 50, 150, 6, 6, { body: 'dynamic', maxSpeed: 100 });
            return createScene();
        });
        body(game, 'Ball').velocity.x = 200;
        body(game, 'Rocket').acceleration.x = 1000;
        body(game, 'Rocket').acceleration.y = 1000;
        game.run(60);
        expect(body(game, 'Ball').velocity.x).toBe(-200);
        expect(body(game, 'Rocket').speed).toBeCloseTo(100, 6);

        const ice = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Rail', 100, 120, 80, 8, { body: 'kinematic', carries: 0 });
            thing('Rider', 100, 100, 10, 10, { body: 'dynamic' });
            return createScene();
        });
        ice.run(30);
        body(ice, 'Rail').velocity.x = 30;
        ice.run(60);
        // The rail went on without it.
        expect(place(ice, 'Rider').x).toBeCloseTo(100, 3);
    });

    it('its own time: paused at 0, half speed at 0.5', () => {
        let world!: TRetroWorld2d;
        const game = make(() => {
            world = useRetroWorld2d({ gravity: { x: 0, y: 0 }, timeScale: 0 });
            thing('Puck', 20, 90, 6, 6, { body: 'dynamic' });
            return createScene();
        });
        body(game, 'Puck').velocity.x = 60;
        game.run(60);
        expect(place(game, 'Puck').x).toBeCloseTo(20, 6);
        world.timeScale = 0.5;
        game.run(60);
        expect(place(game, 'Puck').x).toBeCloseTo(50, 3);
    });
});

describe('what a review found', () => {
    it('a ball off a corner keeps its speed with bounce by axis, as with one bounce, and gains none', () => {
        for (const bounce of [1, { x: 1, y: 1 }, { x: 1, y: 0.5 }]) {
            const game = make(() => {
                useRetroWorld2d({ gravity: { x: 0, y: 0 } });
                // Its corner at (150, 150), right where the ball is headed.
                thing('Block', 170, 170, 40, 40, { body: 'static' });
                thing('Ball', 100, 100, 8, 8, { body: 'dynamic', bounce, round: true });
                return createScene();
            });
            body(game, 'Ball').velocity.x = 120;
            body(game, 'Ball').velocity.y = 120;
            const before = body(game, 'Ball').speed;
            game.run(60);
            if (bounce === 1 || (typeof bounce === 'object' && bounce.y === 1)) expect(body(game, 'Ball').speed).toBeCloseTo(before, 6);
            else expect(body(game, 'Ball').speed).toBeLessThan(before);
            expect(body(game, 'Ball').velocity.x).toBeLessThan(0);
        }
    });

    it('a bullet stops at a thin wall at any speed, and goes the whole way where nothing is', () => {
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Wall', 200, 90, 2, 100, { body: 'static' });
            thing('Bullet', 50, 90, 4, 4, { body: 'dynamic' });
            thing('Free', 50, 160, 4, 4, { body: 'dynamic' });
            return createScene();
        }, { width: 4000, height: 180 });
        body(game, 'Bullet').velocity.x = 100_000;
        body(game, 'Free').velocity.x = 100_000;
        game.run(1);
        expect(place(game, 'Bullet').x).toBeCloseTo(199 - 2, 6);
        expect(body(game, 'Bullet').blocked.right).toBe(true);
        expect(place(game, 'Free').x).toBeCloseTo(50 + 100_000 / 60, 3);
    });

    it('what stays is told a body it touched stopped touching it when that body is destroyed', () => {
        const told: string[] = [];
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Zone', 100, 90, 40, 40, { body: 'static', sensor: true });
            thing('Hero', 100, 90, 10, 10, { body: 'dynamic' });
            thing('Ghost', 100, 90, 10, 10, { body: 'dynamic' });
            return createScene();
        });
        const zone = body(game, 'Zone');
        zone.onEnter((other) => told.push(`in ${other.name}`));
        zone.onExit((other, contact) => {
            told.push(`out ${other.name}`);
            expect(contact.side).toBeDefined();
        });
        game.run(2);
        expect(told.sort()).toEqual(['in Ghost', 'in Hero']);
        told.length = 0;
        destroy(game.find('Hero')!);
        body(game, 'Ghost').destroy();
        game.run(1);
        expect(told.sort()).toEqual(['out Ghost', 'out Hero']);
        // Once, and never again.
        game.run(5);
        expect(told.length).toBe(2);
    });

    it('nobody is told a body left that it was never told was there', () => {
        const told: string[] = [];
        let now = false;
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Zone', 100, 90, 40, 40, { body: 'static', sensor: true });
            // Born inside the zone and destroyed before any step saw it there.
            const late = useSpawn(function Late() {
                createSprite({ width: 10, height: 10, transform: { x: 100, y: 90 } });
                useRetroBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 10, height: 10 } });
            });
            useUpdate(() => {
                if (!now) return;
                now = false;
                destroy(late());
            });
            return createScene();
        });
        body(game, 'Zone').onExit((other) => told.push(other.name));
        game.run(1);
        now = true;
        game.run(3);
        expect(told).toEqual([]);
    });
});

describe('a body that changes size', () => {
    it('keeps its feet on the body it stands on, whether its collider or its object grows', () => {
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Floor', 160, 175, 320, 10, { body: 'static' });
            thing('Hero', 100, 150, 12, 16, { body: 'dynamic' });
            thing('Blob', 200, 150, 12, 12, { body: 'dynamic' });
            return createScene();
        });
        game.run(60);
        expect(place(game, 'Hero').y + 8).toBeCloseTo(170, 6);
        records.get('Hero')!.collider = { shape: 'rect', width: 12, height: 32 };
        game.run(30);
        expect(place(game, 'Hero').y + 16).toBeCloseTo(170, 6);
        expect(body(game, 'Hero').blocked.down).toBe(true);

        expect(place(game, 'Blob').y + 6).toBeCloseTo(170, 6);
        const blob = game.find('Blob')!.drawables[0] as { transform: { scaleX: number; scaleY: number } };
        blob.transform.scaleX = 2;
        blob.transform.scaleY = 2;
        game.run(30);
        expect(place(game, 'Blob').y + 12).toBeCloseTo(170, 6);
    });
});
