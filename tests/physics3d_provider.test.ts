import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { bodyIntoWorld, box3dProvider } from '../src/physics/box3d/provider';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TPhysicsBody, TPhysicsBody3d, TPhysicsWorld } from '../src/physics';
import type { TPhysicsBodyHandle3d, TPhysicsWorldHandle3d } from '../src/physics/box3d/types';
import type { TCharacterBody } from '../src/physics/box3d/character_body';

/**
 * The provider's half: turning what a scene declared into calls on a world.
 *
 * Nothing here loads the WebAssembly, and it does not need to. What can go wrong at this seam is
 * the mapping, and a mapping is exactly what can be read without simulating anything: a shape that
 * reaches the world as the wrong one, a surface field quietly dropped, a body handed to a world
 * that belongs to another scene. The physics itself is box3d's to get right, and it is checked
 * next door with the real thing running.
 */

let warn: ReturnType<typeof spyOn> | null = null;
const silence = () => {
    warn = spyOn(console, 'warn').mockImplementation(() => {});
    return warn;
};

afterEach(() => {
    warn?.mockRestore();
    warn = null;
});

/**
 * A world that records what it was asked for instead of simulating it.
 */
const fakeWorld = () => {
    const calls: Array<{ kind: string; box: TGameObject; options: Record<string, unknown> }> = [];
    const body = {} as TPhysicsBodyHandle3d;
    const record = (kind: string) => (box: TGameObject, options: Record<string, unknown>) => {
        calls.push({ kind, box, options });
        return body;
    };
    const world = {
        addBox: record('box'),
        addSphere: record('sphere'),
        addCapsule: record('capsule'),
        addHull: record('hull'),
        addMesh: record('mesh'),
        addCharacter: () => ({} as TCharacterBody),
        raycast: () => null,
        bodyOf: () => null,
    } as unknown as TPhysicsWorldHandle3d;
    return { calls, world };
};

const box = (name: string): TGameObject => ({ id: name, name } as TGameObject);

const surface = {
    restitution: 0.4, friction: 0.2, density: 3, sensor: true, layer: 2, collidesWith: 0b101,
};

const body3d = (collider: TPhysicsBody3d['collider'], body: TPhysicsBody3d['body'] = 'dynamic'): TPhysicsBody3d => ({
    _type: 'physics3d', id: 'b1', name: 'Thing', body, collider, offset: [0, 0.5, 0], ...surface,
} as TPhysicsBody3d);

describe('what a declared collider becomes', () => {
    it('reaches the world as the shape it named, with everything it is made of', () => {
        const { calls, world } = fakeWorld();

        bodyIntoWorld(world, box('Crate'), body3d({ shape: 'box', size: [2, 1, 3] }));

        expect(calls).toHaveLength(1);
        expect(calls[0].kind).toBe('box');
        expect(calls[0].box.name).toBe('Crate');
        // Every field, because one quietly dropped reads as "sensors are broken" rather than as
        // one missing line. `offset` travels with them here, which the flat half has no need of.
        expect(calls[0].options).toMatchObject({ type: 'dynamic', size: [2, 1, 3], offset: [0, 0.5, 0], ...surface });
    });

    it('takes each of the five shapes to its own door', () => {
        const { calls, world } = fakeWorld();

        bodyIntoWorld(world, box('Crate'), body3d({ shape: 'box', size: [1, 1, 1] }));
        bodyIntoWorld(world, box('Ball'), body3d({ shape: 'sphere', radius: 0.5 }));
        bodyIntoWorld(world, box('Player'), body3d({ shape: 'capsule', radius: 0.3, height: 1.8 }));

        expect(calls.map((call) => call.kind)).toEqual(['box', 'sphere', 'capsule']);
        expect(calls[1].options).toMatchObject({ radius: 0.5 });
        // The whole height, the way a person measures a character. Splitting it into two cap
        // centres is the backend's business and happens further in.
        expect(calls[2].options).toMatchObject({ radius: 0.3, height: 1.8 });
    });

    it('leaves a collider of the other dimension alone', () => {
        const { calls } = fakeWorld();

        box3dProvider.createBody(box('Crate'), {
            _type: 'physics2d', id: 'b1', name: 'Crate', body: 'dynamic',
            collider: { shape: 'rect', width: 24, height: 16 }, ...surface,
        } as TPhysicsBody);

        // Not an error: a project can install both adapters and let each answer for its own.
        expect(calls).toEqual([]);
    });

    it('says once when a collider has no world to be in', () => {
        const said = silence();

        const record = body3d({ shape: 'box', size: [1, 1, 1] });
        box3dProvider.createBody(box('One'), record);
        box3dProvider.createBody(box('Two'), record);

        // A level of two hundred crates with no world on its root would otherwise say it two
        // hundred times.
        expect(said).toHaveBeenCalledTimes(1);
        expect(String(said.mock.calls[0][0])).toContain('world');
    });

    it('leaves a world of the other dimension alone', () => {
        const { calls } = fakeWorld();
        box3dProvider.createWorld({ _type: 'physics-world-2d', id: 'w1', gravity: { x: 0, y: 900 } } as TPhysicsWorld);
        expect(calls).toEqual([]);
    });
});

describe('a collider shaped after something the scene never loaded', () => {
    it('says so once per name and leaves the rest of the level standing', () => {
        const said = silence();
        const { calls, world } = fakeWorld();

        bodyIntoWorld(world, box('Ground'), body3d({ shape: 'mesh', geometry: 'terrain' }, 'static'));
        bodyIntoWorld(world, box('Ground2'), body3d({ shape: 'mesh', geometry: 'terrain' }, 'static'));
        bodyIntoWorld(world, box('Rock'), body3d({ shape: 'hull', geometry: 'rock' }));
        // And a shape that is not named after anything still gets built.
        bodyIntoWorld(world, box('Crate'), body3d({ shape: 'box', size: [1, 1, 1] }));

        expect(calls.map((call) => call.kind)).toEqual(['box']);
        // Once per name, not once per body: two grounds and a rock is two complaints.
        expect(said).toHaveBeenCalledTimes(2);
        expect(String(said.mock.calls[0][0])).toContain('terrain');
        expect(String(said.mock.calls[1][0])).toContain('rock');
    });
});
