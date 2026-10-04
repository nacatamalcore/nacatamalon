import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { createScene } from '../src/scene/create_scene';
import { createSprite } from '../src/gameobjects/sprite/create_sprite';
import { ALL_LAYERS, PHYSICS_LAYERS, createPhysicsBody2d, createPhysicsBody3d, registerPhysicsProvider } from '../src/physics';
import { serializeScene } from '../src/scene/document';
import { usePhysicsBody2d, usePhysicsBody3d, usePhysicsWorld2d, usePhysicsWorld3d } from '../src/hooks/physics';
import { useSpawn } from '../src/hooks/spawn/use_spawn';
import { useTransform } from '../src/hooks/transform/use_transform';
import { worldPlacementOf, localPositionFrom, placementOf } from '../src/box';
import { createTestGame, startTestScene } from './helpers/test_game';
import type { TBox } from '../src/box';
import type { TPhysicsBody, TPhysicsProvider, TPhysicsWorld } from '../src/physics';

/**
 * The engine's half of physics: the format, and nothing that moves.
 *
 * The two claims worth pinning are the ones that only fail quietly. A scene with no adapter has to
 * **keep** every collider it declares, or a level authored in a tool that does not simulate would
 * save as an empty room. And the world has to reach whatever simulates **before** any body does,
 * because a body added to a world that does not exist yet is either an error or, worse, a body in a
 * second world nobody can see.
 */

const tint = { r: 1, g: 1, b: 1, a: 1 };
const at = (x: number, y: number) => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });
const rect = { shape: 'rect', width: 24, height: 24 } as const;

let warn: ReturnType<typeof spyOn> | null = null;
const silence = () => {
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    return warn;
};

/**
 * Everything a provider was asked to do, in order.
 */
const recorder = () => {
    const calls: string[] = [];
    const worlds: TPhysicsWorld[] = [];
    const bodies: Array<{ box: TBox; body: TPhysicsBody }> = [];
    const provider: TPhysicsProvider = {
        createWorld: (world) => { calls.push('world'); worlds.push(world); },
        createBody: (box, body) => { calls.push('body'); bodies.push({ box, body }); },
    };
    return { calls, worlds, bodies, provider };
};

afterEach(() => {
    warn?.mockRestore();
    warn = null;
    registerPhysicsProvider(null);
});

describe('a collider as a record', () => {
    it('comes out complete however little it was given', () => {
        const body = createPhysicsBody2d({ body: 'dynamic', collider: rect });

        // All six, because an absent one would mean "whatever the adapter does", and then what a
        // scene means would depend on who reads it.
        expect(body).toMatchObject({
            _type: 'physics2d', body: 'dynamic',
            restitution: 0, friction: 0.5, density: 1, sensor: false, layer: 0, collidesWith: ALL_LAYERS,
        });
        expect(body.id).not.toBe('');
    });

    it('keeps what was asked for over the defaults', () => {
        const body = createPhysicsBody2d({ body: 'static', collider: rect, friction: 0, sensor: true, layer: 3 });
        expect(body).toMatchObject({ friction: 0, sensor: true, layer: 3, density: 1 });
    });

    it('starts a shape in three dimensions centred, and lets it be moved inside its object', () => {
        expect(createPhysicsBody3d({ body: 'dynamic', collider: { shape: 'sphere', radius: 1 } }).offset).toEqual([0, 0, 0]);
        expect(createPhysicsBody3d({ body: 'dynamic', collider: { shape: 'sphere', radius: 1 }, offset: [0, 0.9, 0] }).offset).toEqual([0, 0.9, 0]);
    });

    it('collides with everything until a scene says otherwise', () => {
        expect(PHYSICS_LAYERS).toBe(16);
        expect(ALL_LAYERS).toBe(0b1111_1111_1111_1111);
        expect(createPhysicsBody2d({ body: 'dynamic', collider: rect }).collidesWith).toBe(ALL_LAYERS);
    });
});

describe('a scene with nothing to simulate it', () => {
    it('keeps every collider it declares, says so once, and does not throw', () => {
        const said = silence();

        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 900 } });
            useSpawn(function Crate() {
                createSprite({ width: 24, height: 24, tint, transform: at(10, 10) });
                usePhysicsBody2d({ body: 'dynamic', collider: rect });
            })();
            useSpawn(function Floor() {
                createSprite({ width: 200, height: 8, tint, transform: at(0, 180) });
                usePhysicsBody2d({ body: 'static', collider: { shape: 'rect', width: 200, height: 8 } });
            })();
            return createScene();
        });

        expect(root.physicsWorld).toMatchObject({ _type: 'physics-world-2d', gravity: { x: 0, y: 900 } });
        expect(root.children[0].physics).toMatchObject({ body: 'dynamic' });
        expect(root.children[1].physics).toMatchObject({ body: 'static' });

        // Once for the three of them: a level with two hundred crates would bury the console, and
        // the two-hundredth warning says nothing the first did not.
        expect(said).toHaveBeenCalledTimes(1);

        // And it writes out whole, which is what a tool that does not simulate has to be able to do.
        const doc = serializeScene(root);
        expect(doc.root.components[0]).toMatchObject({ type: 'physics-world-2d' });
        expect(doc.root.children[0].components.map((component) => component.type)).toEqual(['sprite', 'physics2d']);
    });
});

describe('both halves installed at once', () => {
    it('lets each one answer for its own dimension instead of the last one winning', () => {
        const seen: string[] = [];
        const half = (label: string): TPhysicsProvider => ({
            createWorld: (world) => { seen.push(`${label}:${world._type}`); },
            createBody: (_box, body) => { seen.push(`${label}:${body._type}`); },
        });
        // A game with a flat world and a solid one installs both packages. With one slot the
        // second install replaced the first and every collider of the other dimension went inert
        // WITHOUT A WORD, because the winner simply ignores what is not its own.
        registerPhysicsProvider(half('flat'));
        registerPhysicsProvider(half('solid'));

        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            useSpawn(function Crate() {
                createSprite({ width: 8, height: 8, tint, transform: at(0, 0) });
                usePhysicsBody2d({ body: 'dynamic', collider: rect });
            })();
            return createScene();
        });

        expect(seen).toEqual(['flat:physics-world-2d', 'solid:physics-world-2d', 'flat:physics2d', 'solid:physics2d']);
    });

    it('installs the same one only once, so a scene is never simulated twice over', () => {
        const seen: string[] = [];
        const only: TPhysicsProvider = {
            createWorld: (world) => { seen.push(world._type); },
            createBody: () => {},
        };
        registerPhysicsProvider(only);
        registerPhysicsProvider(only);

        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            usePhysicsWorld2d();
            return createScene();
        });

        expect(seen).toEqual(['physics-world-2d']);
    });
});

describe('an object in space that is not anywhere', () => {
    it('is written down, said once, and not handed over to be simulated', () => {
        const said = silence();
        const { provider, bodies } = recorder();
        registerPhysicsProvider(provider);

        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            usePhysicsWorld3d();
            useSpawn(function Crate() {
                // A picture, and nothing else: flat, so it says nothing about depth or facing.
                createSprite({ width: 24, height: 24, tint, transform: at(10, 10) });
                usePhysicsBody3d({ body: 'dynamic', collider: { shape: 'box', size: [1, 1, 1] } });
            })();
            return createScene();
        });

        // Kept, so a level authored in a tool that does not simulate still saves its collider.
        expect(root.children[0].physics).toMatchObject({ _type: 'physics3d', body: 'dynamic' });
        // And never handed over, because there would be nowhere to write the answer back to.
        expect(bodies).toHaveLength(0);
        expect(said).toHaveBeenCalledTimes(1);
    });
});

describe('what the engine hands to whatever simulates', () => {
    it('opens the world before it adds a single body', () => {
        const { provider, calls, worlds, bodies } = recorder();
        registerPhysicsProvider(provider);

        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            usePhysicsWorld2d({ gravity: { x: 0, y: 900 } });
            useSpawn(function Crate() {
                createSprite({ width: 24, height: 24, tint, transform: at(10, 10) });
                usePhysicsBody2d({ body: 'dynamic', collider: rect });
            })();
            return createScene();
        });

        // A body reaching a world that does not exist yet is either an error or a body in a second
        // world nobody can see, and the second one is the sort that takes an afternoon.
        expect(calls).toEqual(['world', 'body']);
        expect(worlds[0]).toMatchObject({ gravity: { x: 0, y: 900 } });
        expect(bodies[0].box.name).toBe('Crate');
        expect(bodies[0].body).toMatchObject({ body: 'dynamic', collider: rect });
    });

    it('stops handing anything over once nothing is installed', () => {
        const { provider, calls } = recorder();
        registerPhysicsProvider(provider);
        registerPhysicsProvider(null);
        const said = silence();

        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            usePhysicsBody2d({ body: 'dynamic', collider: rect });
            return createScene();
        });

        expect(calls).toEqual([]);
        // The warning comes back with the change, so swapping adapters reports its own problems
        // instead of staying quiet because an earlier one already complained.
        expect(said).toHaveBeenCalledTimes(1);
    });

    it('says when a simulation is declared somewhere only a scene may declare one', () => {
        const said = silence();

        const { store } = createTestGame();
        startTestScene(store, 'Level', () => {
            useSpawn(function Crate() {
                usePhysicsWorld2d();
            })();
            return createScene();
        });

        // Only a scene's own is read, so declaring one on an object inside it would be gravity
        // nobody applies.
        expect(String(said.mock.calls[0][0])).toContain('Crate');
    });
});

describe('where a body is', () => {
    it('is what the object has, whichever of the two carries it', () => {
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Placed() {
                useTransform({ x: 5, y: 6 });
                createSprite({ width: 8, height: 8, tint, transform: at(0, 0) });
            })();
            useSpawn(function Drawn() {
                createSprite({ width: 8, height: 8, tint, transform: at(40, 60) });
            })();
            useSpawn(function Empty() {})();
            return createScene();
        });

        expect(placementOf(root.children[0])).toMatchObject({ x: 5, y: 6 });
        expect(placementOf(root.children[1])).toMatchObject({ x: 40, y: 60 });
        expect(placementOf(root.children[2])).toBeNull();
    });

    it('is composed through the objects above it, which is how a level is organised', () => {
        silence();
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            useSpawn(function Group() {
                useTransform({ x: 100, y: 50 });
                useSpawn(function Crate() {
                    createSprite({ width: 8, height: 8, tint, transform: at(10, 4) });
                    usePhysicsBody2d({ body: 'dynamic', collider: rect });
                })();
            })();
            return createScene();
        });
        const crate = root.children[0].children[0];

        // A body told its local numbers would simulate correctly a hundred pixels to the left.
        expect(worldPlacementOf(crate)).toMatchObject({ x: 110, y: 54 });

        // And back again, which is the half that makes a solver's answer writable.
        expect(localPositionFrom(crate, { x: 110, y: 54 })).toMatchObject({ x: 10, y: 4 });
    });

    it('does not let what an object DRAWS move the things under it', () => {
        silence();
        const { store } = createTestGame();
        const root = startTestScene(store, 'Level', () => {
            // A label in the corner, on the scene itself, which is how a HUD is written.
            createSprite({ width: 8, height: 8, tint, transform: at(30, 16) });
            useSpawn(function Crate() {
                createSprite({ width: 8, height: 8, tint, transform: at(100, 50) });
                usePhysicsBody2d({ body: 'dynamic', collider: rect });
            })();
            return createScene();
        });
        const crate = root.children[0];

        // The scene is still nowhere in particular. Reading its label's corner as the room's
        // placement would shift every object in the room by it, and a simulation would then write
        // every body back shifted the other way: wrong twice, and neither is visible in a test
        // that only ever asks about a leaf.
        expect(worldPlacementOf(crate)).toMatchObject({ x: 100, y: 50 });
        expect(localPositionFrom(crate, { x: 100, y: 50 })).toMatchObject({ x: 100, y: 50 });
    });
});
