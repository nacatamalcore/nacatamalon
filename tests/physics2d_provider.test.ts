import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { bodyIntoWorld, rapier2dProvider } from '../src/physics/rapier2d/provider';
import type { TGameObject } from '../src/hooks/spawn/use_spawn';
import type { TPhysicsBody, TPhysicsBody2d, TPhysicsWorld } from '../src/physics';
import type { TPhysicsBodyHandle2d, TPhysicsWorldHandle2d } from '../src/physics/rapier2d/types';

/**
 * The provider's half: turning what a scene declared into calls on a world.
 *
 * Nothing here loads the WebAssembly, and it does not need to. What can go wrong at this seam is
 * the mapping, and a mapping is exactly what can be read without simulating anything: a shape that
 * reaches the world as the wrong one, a surface field quietly dropped, a body handed to a world
 * that belongs to another scene. The physics itself is Rapier's to get right.
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
    const body = {} as TPhysicsBodyHandle2d;
    const world: TPhysicsWorldHandle2d = {
        addCircle: (box, options) => { calls.push({ kind: 'circle', box, options }); return body; },
        addRect: (box, options) => { calls.push({ kind: 'rect', box, options }); return body; },
        addPolygon: (box, options) => { calls.push({ kind: 'polygon', box, options }); return body; },
        bodyOf: () => null,
    };
    return { calls, world };
};

const box = (name: string): TGameObject => ({ id: name, name } as TGameObject);

const surface = {
    restitution: 0.4, friction: 0.2, density: 3, sensor: true, layer: 2, collidesWith: 0b101,
};

describe('what a declared collider becomes', () => {
    it('reaches the world as the shape it named, with everything it is made of', () => {
        const { calls, world } = fakeWorld();

        bodyIntoWorld(world, box('Crate'), {
            _type: 'physics2d', id: 'b1', name: 'Crate', body: 'dynamic',
            collider: { shape: 'rect', width: 24, height: 16 },
            ...surface,
        } as TPhysicsBody2d);

        expect(calls).toHaveLength(1);
        expect(calls[0].kind).toBe('rect');
        expect(calls[0].box.name).toBe('Crate');
        // Every field, because one quietly dropped reads as "sensors are broken" rather than as
        // one missing line.
        expect(calls[0].options).toMatchObject({ type: 'dynamic', width: 24, height: 16, ...surface });
    });

    it('takes a circle and a polygon to their own doors', () => {
        const { calls, world } = fakeWorld();

        bodyIntoWorld(world, box('Ball'), {
            _type: 'physics2d', id: 'b1', name: 'Ball', body: 'dynamic',
            collider: { shape: 'circle', radius: 8 }, ...surface,
        } as TPhysicsBody2d);
        bodyIntoWorld(world, box('Ramp'), {
            _type: 'physics2d', id: 'b2', name: 'Ramp', body: 'static',
            collider: { shape: 'polygon', vertices: [[0, 0], [40, 0], [40, 20]] }, ...surface,
        } as TPhysicsBody2d);

        expect(calls.map((call) => call.kind)).toEqual(['circle', 'polygon']);
        expect(calls[0].options).toMatchObject({ radius: 8 });
        expect(calls[1].options).toMatchObject({ vertices: [[0, 0], [40, 0], [40, 20]] });
    });

    it('leaves a collider of the other dimension alone', () => {
        const { calls } = fakeWorld();

        rapier2dProvider.createBody(box('Player'), {
            _type: 'physics3d', id: 'b1', name: 'Player', body: 'dynamic',
            collider: { shape: 'capsule', radius: 0.3, height: 1.8 }, offset: [0, 0, 0], ...surface,
        } as TPhysicsBody);

        // Not an error: a project can install both adapters and let each answer for its own.
        expect(calls).toEqual([]);
    });

    it('says once when a collider has no world to be in', () => {
        const said = silence();

        const body = {
            _type: 'physics2d', id: 'b1', name: 'Crate', body: 'dynamic',
            collider: { shape: 'rect', width: 8, height: 8 }, ...surface,
        } as TPhysicsBody;
        rapier2dProvider.createBody(box('One'), body);
        rapier2dProvider.createBody(box('Two'), body);

        // A level of two hundred crates with no world on its root would otherwise say it two
        // hundred times.
        expect(said).toHaveBeenCalledTimes(1);
        expect(String(said.mock.calls[0][0])).toContain('world');
    });

    it('leaves a world of the other dimension alone', () => {
        const { calls } = fakeWorld();
        rapier2dProvider.createWorld({ _type: 'physics-world-3d', id: 'w1', gravity: { x: 0, y: -9.81, z: 0 } } as TPhysicsWorld);
        expect(calls).toEqual([]);
    });
});
