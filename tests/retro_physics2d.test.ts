import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createHeadlessGame } from '../src/headless';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useSelf } from '../src/hooks/spawn/use_self';
import { useUpdate } from '../src/hooks/loop/use_update';
import { useTransform } from '../src/hooks/transform/use_transform';
import { useCollisionWith } from '../src/hooks/hitbox';
import { registerPhysicsProvider, ALL_LAYERS } from '../src/physics';
import { physics2dProvider, getPhysicsBody2d } from '../src/physics/box2d/provider';
import { retroPhysics2dProvider, getRetroBody2d } from '../src/physics/retro2d/provider';
import { useRetroBody2d, useRetroWorld2d, usePhysicsBody2d, usePhysicsWorld2d } from '../src/hooks/physics';
import { parseSceneDoc, sceneFromDoc, serializeScene } from '../src/scene/document';
import { registerScene } from '../src/scene/register_scene';
import { startScene } from '../src/scene/start_scene';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { THeadlessGame } from '../src/headless';
import type { TSceneFn } from '../src/scene';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TRetroBody2dOptions } from '../src/hooks/physics/use_retro_body';
import type { TSceneDoc } from '../src/scene/document';

/**
 * The retro half of physics: bodies that never turn, moved a fixed step at a time and stopped axis
 * by axis.
 */

const games: THeadlessGame[] = [];
let warn: ReturnType<typeof spyOn> | null = null;

afterEach(() => {
    games.splice(0).forEach((game) => game.destroy());
    registerPhysicsProvider(null);
    warn?.mockRestore();
    warn = null;
});

const make = (scene: TSceneFn): THeadlessGame => {
    const game = createHeadlessGame({ width: 320, height: 180, scenes: { Level: scene } });
    games.push(game);
    return game;
};

/** An object drawn as a plain box at `x, y`, with a retro body of its size. */
const thing = (name: string, x: number, y: number, w: number, h: number, options: Omit<TRetroBody2dOptions, 'collider'> & { round?: boolean }) =>
    useSpawn(function Thing() {
        createSprite({ width: w, height: h, transform: { x, y } });
        const { round, ...rest } = options;
        useRetroBody2d({ ...rest, collider: round === true ? { shape: 'circle', radius: w / 2 } : { shape: 'rect', width: w, height: h } });
    }, name)();

const place = (game: THeadlessGame, name: string) => (game.find(name)!.drawables[0] as { transform: { x: number; y: number } }).transform;
const body = (game: THeadlessGame, name: string) => getRetroBody2d(game.find(name)!)!;

describe('retro bodies', () => {
    it('fall onto the ground, stop on it, and say so', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Ground', 160, 170, 300, 20, { body: 'static' });
            thing('Crate', 100, 20, 20, 20, { body: 'dynamic' });
            return createScene();
        });
        game.run(1);
        expect(place(game, 'Crate').y).toBeGreaterThan(20);
        game.run(180);
        // Its bottom on the ground's top: 160 - 10.
        expect(place(game, 'Crate').y).toBeCloseTo(150, 6);
        expect(body(game, 'Crate').blocked.down).toBe(true);
        expect(body(game, 'Crate').velocity.y).toBe(0);
        game.run(60);
        expect(place(game, 'Crate').y).toBeCloseTo(150, 6);
    });

    it('do not pass through a thin wall however fast they go', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Wall', 200, 90, 2, 100, { body: 'static' });
            thing('Bullet', 20, 90, 4, 4, { body: 'dynamic' });
            return createScene();
        });
        body(game, 'Bullet').velocity.x = 20000;
        game.run(10);
        expect(place(game, 'Bullet').x).toBeCloseTo(199 - 2, 6);
        expect(body(game, 'Bullet').velocity.x).toBe(0);
    });

    it('bounce with their own bounce, whatever they hit', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Wall', 200, 90, 10, 100, { body: 'static' });
            thing('Ball', 100, 90, 8, 8, { body: 'dynamic', bounce: 1, round: true });
            return createScene();
        });
        body(game, 'Ball').velocity.x = 120;
        game.run(120);
        expect(body(game, 'Ball').velocity.x).toBe(-120);
        expect(place(game, 'Ball').x).toBeLessThan(195);
    });

    it('push another dynamic body by their masses, and stop when it is against a wall', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Wall', 300, 90, 20, 100, { body: 'static' });
            thing('Crate', 120, 90, 20, 20, { body: 'dynamic', mass: 1 });
            thing('Hero', 99, 90, 20, 20, { body: 'dynamic', mass: 1 });
            return createScene();
        });
        const hero = body(game, 'Hero');
        useHeld(game, () => { hero.velocity.x = 60; });
        game.run(30);
        // Pushing a crate as heavy as itself, it goes along with it.
        expect(place(game, 'Crate').x).toBeGreaterThan(125);
        expect(place(game, 'Hero').x).toBeCloseTo(place(game, 'Crate').x - 20, 3);
        expect(hero.blocked.right).toBe(false);
        game.run(600);
        // The crate against the wall's left side (290), and the hero against the crate.
        expect(place(game, 'Crate').x).toBeCloseTo(280, 3);
        expect(place(game, 'Hero').x).toBeCloseTo(260, 3);
        expect(hero.blocked.right).toBe(true);
    });

    it('are carried by a lift they stand on', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Lift', 100, 120, 60, 10, { body: 'kinematic' });
            thing('Rider', 100, 100, 10, 10, { body: 'dynamic' });
            return createScene();
        });
        game.run(60);
        expect(place(game, 'Rider').y).toBeCloseTo(110, 3);
        const lift = body(game, 'Lift');
        lift.velocity.x = 30;
        game.run(60);
        expect(place(game, 'Lift').x).toBeCloseTo(130, 3);
        expect(place(game, 'Rider').x).toBeCloseTo(130, 1);
        lift.velocity.x = 0;
        lift.velocity.y = -30;
        game.run(30);
        expect(place(game, 'Lift').y).toBeCloseTo(105, 3);
        expect(place(game, 'Rider').y).toBeCloseTo(95, 3);
    });

    it('tell what they start and stop touching, and a sensor stops nothing', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const told: string[] = [];
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            useSpawn(function Coin() {
                createSprite({ width: 10, height: 10, transform: { x: 100, y: 90 } });
                useRetroBody2d({ body: 'static', sensor: true, collider: { shape: 'rect', width: 10, height: 10 } });
            }, 'Coin')();
            useSpawn(function Hero() {
                createSprite({ width: 10, height: 10, transform: { x: 50, y: 90 } });
                useRetroBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 10, height: 10 } });
                const self = useSelf();
                const hero = getRetroBody2d(self)!;
                hero.onEnter((other) => told.push(`enter ${other.name}`));
                hero.onExit((other) => told.push(`exit ${other.name}`));
                useUpdate(() => { hero.velocity.x = 60; });
            }, 'Hero')();
            return createScene();
        });
        game.run(120);
        expect(told).toEqual(['enter Coin', 'exit Coin']);
        expect(place(game, 'Hero').x).toBeGreaterThan(150);
    });

    it('meet what a collision asks for, by tag, with no hitbox', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const said: string[] = [];
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            useSpawn(function Ground() {
                useTransform({ x: 160, y: 170 });
                useRetroBody2d({ body: 'static', collider: { shape: 'rect', width: 300, height: 20 } });
            }, { name: 'Ground', tags: ['floor'] })();
            useSpawn(function Crate() {
                useTransform({ x: 100, y: 20 });
                useRetroBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
                useCollisionWith('floor', (floor) => said.push((floor as TGameObject).name), { when: 'start' });
            }, 'Crate')();
            return createScene();
        });
        game.run(10);
        expect(said).toEqual([]);
        game.run(120);
        expect(said).toEqual(['Ground']);
    });

    it('pass through what their layers do not meet', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Wall', 150, 90, 10, 100, { body: 'static', layer: 1 });
            thing('Ghost', 100, 90, 10, 10, { body: 'dynamic', collidesWith: ALL_LAYERS & ~(1 << 1) });
            return createScene();
        });
        body(game, 'Ghost').velocity.x = 60;
        game.run(120);
        expect(place(game, 'Ghost').x).toBeGreaterThan(200);
    });

    it('follow an object the game moves by hand', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Wall', 150, 90, 10, 100, { body: 'static' });
            thing('Hero', 50, 90, 10, 10, { body: 'dynamic' });
            return createScene();
        });
        game.run(1);
        place(game, 'Hero').x = 200;
        // Walking left all the time, as a held key does: stopped means pressed against it.
        useHeld(game, () => { body(game, 'Hero').velocity.x = -60; });
        game.run(60);
        // From where it was put, back against the wall's right side (155).
        expect(place(game, 'Hero').x).toBeCloseTo(160, 3);
        expect(body(game, 'Hero').blocked.left).toBe(true);
    });

    it('come out the same on every run', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const run = (): number[] => {
            const game = make(() => {
                useRetroWorld2d({ gravity: { x: 0, y: 900 } });
                thing('Ground', 160, 170, 300, 20, { body: 'static' });
                for (let i = 0; i < 12; i++) thing(`Box${i}`, 40 + i * 21, 20 + (i % 3) * 25, 12 + (i % 4), 12, { body: 'dynamic', bounce: 0.3, round: i % 2 === 0 });
                return createScene();
            });
            for (let i = 0; i < 12; i++) body(game, `Box${i}`).velocity.x = (i % 2 === 0 ? 1 : -1) * 70;
            game.run(240);
            return Array.from({ length: 12 }, (_, i) => [place(game, `Box${i}`).x, place(game, `Box${i}`).y]).flat();
        };
        expect(run()).toEqual(run());
    });
});

describe('retro bodies, what review found', () => {
    it('move under a force asked for every frame', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Ship', 50, 90, 10, 10, { body: 'dynamic', mass: 2 });
            return createScene();
        });
        const ship = body(game, 'Ship');
        useHeld(game, () => ship.applyForce(120, 0));
        game.run(60);
        // 60 px/s² for a second.
        expect(ship.velocity.x).toBeCloseTo(60, 6);
        expect(place(game, 'Ship').x).toBeGreaterThan(70);
    });

    it('come out of what they were put a little inside by the shorter way', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Ground', 160, 170, 300, 20, { body: 'static' });
            // Its bottom a pixel into the ground's top (160).
            thing('Walker', 100, 151, 20, 20, { body: 'dynamic' });
            return createScene();
        });
        useHeld(game, () => { body(game, 'Walker').velocity.x = 30; });
        game.run(1);
        expect(place(game, 'Walker').x).toBeGreaterThan(99);
        expect(place(game, 'Walker').y).toBeCloseTo(150, 6);
    });

    it('stay on a lift the game raises by hand while they walk on it', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Lift', 160, 150, 100, 10, { body: 'kinematic' });
            thing('Rider', 160, 140, 10, 10, { body: 'dynamic' });
            return createScene();
        });
        game.run(30);
        useHeld(game, () => {
            place(game, 'Lift').y -= 1;
            body(game, 'Rider').velocity.x = 20;
        });
        game.run(40);
        expect(place(game, 'Rider').x).toBeLessThan(200);
        expect(place(game, 'Rider').y).toBeCloseTo(place(game, 'Lift').y - 10, 0);
    });

    it('pushed by something driven push the crate beyond them, and none climbs on another', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Ground', 160, 170, 400, 20, { body: 'static' });
            thing('Pusher', 60, 140, 20, 40, { body: 'kinematic' });
            thing('C1', 80, 150, 20, 20, { body: 'dynamic' });
            thing('C2', 100, 150, 20, 20, { body: 'dynamic' });
            return createScene();
        });
        game.run(10);
        body(game, 'Pusher').velocity.x = 40;
        game.run(60);
        expect(place(game, 'C1').y).toBeCloseTo(150, 3);
        expect(place(game, 'C2').y).toBeCloseTo(150, 3);
        expect(place(game, 'C2').x - place(game, 'C1').x).toBeGreaterThanOrEqual(20 - 1e-3);
        expect(place(game, 'C1').x).toBeGreaterThan(110);
    });

    it('taken out by the game touch nothing any more, and a collision hears it end', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const said: string[] = [];
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            useSpawn(function Ground() {
                useTransform({ x: 160, y: 170 });
                useRetroBody2d({ body: 'static', collider: { shape: 'rect', width: 300, height: 20 } });
            }, { name: 'Ground', tags: ['floor'] })();
            useSpawn(function Crate() {
                useTransform({ x: 100, y: 140 });
                useRetroBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
                useCollisionWith('floor', () => said.push('end'), { when: 'end' });
            }, 'Crate')();
            return createScene();
        });
        game.run(30);
        const crate = game.find('Crate')!;
        getRetroBody2d(crate)!.destroy();
        game.run(2);
        expect(getRetroBody2d(crate)).toBeNull();
        expect(said).toEqual(['end']);
    });

    it('found deep in each other, push apart without throwing either through a wall', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Wall', 100, 120, 200, 4, { body: 'static' });
            // The ship 18 pixels into the enemy, its bottom just above the wall's top (118).
            thing('Ship', 50, 110, 14, 14, { body: 'dynamic' });
            thing('Enemy', 50, 92, 16, 16, { body: 'dynamic', mass: 4 });
            return createScene();
        });
        body(game, 'Enemy').velocity.y = 30;
        game.run(10);
        expect(place(game, 'Ship').y).toBeLessThanOrEqual(118 - 7 + 1e-6);
        expect(place(game, 'Enemy').y).toBeLessThanOrEqual(place(game, 'Ship').y - 15 + 1e-3);
    });

    it('weighing nothing still stack', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('Ground', 160, 170, 300, 20, { body: 'static' });
            thing('Low', 100, 140, 20, 20, { body: 'dynamic', mass: 0 });
            thing('High', 100, 110, 20, 20, { body: 'dynamic', mass: 0 });
            return createScene();
        });
        game.run(120);
        expect(place(game, 'Low').y).toBeCloseTo(150, 3);
        expect(place(game, 'High').y).toBeCloseTo(130, 3);
    });

    it('do not step over a small post however wide they are', () => {
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            useRetroWorld2d({ gravity: { x: 0, y: 0 } });
            thing('Post', 200, 85, 4, 4, { body: 'static', round: true });
            thing('Slab', 100, 90, 100, 20, { body: 'dynamic' });
            return createScene();
        });
        useHeld(game, () => { body(game, 'Slab').velocity.x = 600; });
        game.run(30);
        // Its right edge stopped at the post's left side (198).
        expect(place(game, 'Slab').x + 50).toBeLessThanOrEqual(198 + 1e-3);
        expect(place(game, 'Slab').y).toBeCloseTo(90, 3);
    });
});

describe('the retro half beside the full simulation', () => {
    it('each moves only its own scene, and neither takes the other one\'s bodies', async () => {
        registerPhysicsProvider(physics2dProvider);
        registerPhysicsProvider(retroPhysics2dProvider);
        const Retro: TSceneFn = () => {
            useRetroWorld2d({ gravity: { x: 0, y: 900 } });
            thing('RetroCrate', 100, 20, 20, 20, { body: 'dynamic' });
            return createScene();
        };
        const game = createHeadlessGame({ width: 320, height: 180, scenes: { Retro } });
        games.push(game);
        await game.loaded();
        game.run(30);
        const crate = game.find('RetroCrate')!;
        expect(getRetroBody2d(crate)).not.toBeNull();
        expect(getPhysicsBody2d(crate)).toBeNull();
        expect((crate.drawables[0] as { transform: { y: number } }).transform.y).toBeGreaterThan(20);
    });

    it('says once when a retro body is in a scene with a world of the other kind', async () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        registerPhysicsProvider(physics2dProvider);
        registerPhysicsProvider(retroPhysics2dProvider);
        const game = make(() => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 900 } });
            thing('A', 100, 20, 20, 20, { body: 'dynamic' });
            thing('B', 140, 20, 20, 20, { body: 'dynamic' });
            useSpawn(function Full() {
                createSprite({ width: 20, height: 20, transform: { x: 200, y: 20 } });
                usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 20, height: 20 } });
            }, 'Full')();
            return createScene();
        });
        await game.loaded();
        game.run(30);
        const said = warn.mock.calls.filter((call: unknown[]) => String(call[0]).includes('retro-physics2d'));
        expect(said).toHaveLength(1);
        expect(place(game, 'A').y).toBe(20);
        expect(place(game, 'Full').y).toBeGreaterThan(20);
    });
});

describe('a scene with retro physics, written and read', () => {
    const at = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
    const tint = { r: 1, g: 1, b: 1, a: 1 };

    const rebuilt = (doc: TSceneDoc): TSceneDoc => {
        const { store } = createTestGame();
        registerScene(store, doc.name, sceneFromDoc(doc));
        return serializeScene(startScene(store, doc.name));
    };

    it('comes back the same', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useRetroWorld2d({ gravity: { x: 0, y: 600 } });
            useSpawn(function Crate() {
                createSprite({ width: 24, height: 24, tint, transform: at(10, 10) });
                useRetroBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 24, height: 24 }, bounce: 0.5, drag: 300, maxSpeed: { x: 90, y: 420 }, mass: 3, layer: 2 });
            })();
            useSpawn(function Ball() {
                createSprite({ width: 8, height: 8, tint, transform: at(60, 10) });
                useRetroBody2d({ body: 'kinematic', collider: { shape: 'circle', radius: 4 }, gravityScale: 0, sensor: true });
            })();
            return createScene();
        });
        const doc = serializeScene(root);

        expect(parseSceneDoc(doc, '/scenes/level.scene')).toEqual(doc);
        expect(rebuilt(doc)).toEqual(doc);
        expect(rebuilt(rebuilt(doc))).toEqual(doc);
    });

    const level = (component: unknown) => ({
        format: 'nacatamalon-scene',
        version: 1,
        name: 'Level',
        assets: [],
        root: {
            id: 'root', name: 'Level', transform: null, children: [],
            components: [component, { type: 'sprite', id: 'art', texture: null, tint, width: 4, height: 4 }],
        },
    });

    it('fills in what a file leaves out', () => {
        const doc = parseSceneDoc(level({ type: 'retro-body-2d', id: 'b1', collider: { shape: 'rect', width: 10, height: 10 } }), 'test');
        expect(doc.root.components[0]).toEqual({
            type: 'retro-body-2d', id: 'b1', name: 'Body', body: 'static',
            collider: { shape: 'rect', width: 10, height: 10 },
            enabled: true, bounce: 0, drag: 0, maxSpeed: null, gravityScale: 1, mass: 1, pushable: true,
            solidSides: { up: true, down: true, left: true, right: true }, bounds: 'pass', carries: 1,
            sensor: false, layer: 0, collidesWith: ALL_LAYERS,
        });
        const world = parseSceneDoc(level({ type: 'retro-world-2d', id: 'w1' }), 'test');
        expect(world.root.components[0]).toEqual({ type: 'retro-world-2d', id: 'w1', gravity: { x: 0, y: 900 }, bounds: null, timeScale: 1 });
    });

    it('keeps a polygon it cannot make in the hole for what it cannot read', () => {
        warn = spyOn(console, 'warn').mockImplementation(() => {});
        const doc = parseSceneDoc(level({ type: 'retro-body-2d', id: 'b1', collider: { shape: 'polygon', vertices: [[0, 0], [10, 0], [10, 10]] } }), 'test');
        expect(doc.root.components.map((component) => component.type)).toEqual(['sprite']);
        const { store } = createTestGame();
        registerScene(store, 'Level', sceneFromDoc(doc, 'test'));
        const root = startScene(store, 'Level');
        expect(root.physics).toBeNull();
        expect(JSON.stringify(serializeScene(root))).toContain('polygon');
    });
});

/** Runs `set` before every frame, as a held key would. */
function useHeld(game: THeadlessGame, set: () => void): void {
    const run = game.run.bind(game);
    game.run = (frames = 1) => {
        for (let i = 0; i < frames; i++) {
            set();
            run(1);
        }
    };
}

