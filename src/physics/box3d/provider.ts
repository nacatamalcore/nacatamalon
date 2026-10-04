import { useSceneUnmount } from '../../hooks/scene/use_scene_unmount';
import { getGeometry } from '../../geometry';
import { getActiveGame } from '../../store';
import { registerPhysicsProvider } from '../physics_provider';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TPhysicsBody, TPhysicsBody3d, TPhysicsWorld } from '../types/t_physics';
import type { TRuntimeStore } from '../../store';
import type { TPhysicsProvider } from '../physics_provider';
import { usePhysicsWorld } from './physics_world';
import type { TPhysicsWorldHandle3d, TColliderOptions3d } from './types';

/**
 * The world the current scene's document declared, if any. Module state because the provider
 * is a single registered object while worlds come and go with scenes: `createWorld` opens
 * one, `createBody` adds to it, and the scene's teardown closes it.
 */
let current: TPhysicsWorldHandle3d | null = null;

/**
 * The game `current` belongs to.
 *
 * A world outlives the deserialization that built it, and `useSceneUnmount` only clears the
 * pointer when that scene is torn down *properly*. Two situations are not that: the editor runs
 * a second engine instance for Play alongside the live one, and a scene can simply be abandoned.
 * In both, a bare module pointer keeps answering with a world belonging to somewhere else, which
 * is the failure this adapter hit first in the other engine and the reason the check is here from
 * the start.
 */
let owner: TRuntimeStore | null = null;

/**
 * The 3D physics world the running scene built, or `null` if it has none.
 *
 * The seam between authored data and authored behaviour, and the twin of the 2D adapter's
 * accessor of the same name. A collider is data: the scene declares it and this provider
 * simulates it, with no code on either side. Steering is not, and neither is a character, a
 * ray or a trigger's answer, so this is the way back out.
 *
 * Pair it with `world.bodyOf(box)` to reach an object's own collider: the engine built the body
 * and handed it here, so the handle `addBox` returned never went to the game.
 *
 * `null` is an ordinary answer, not an error, and scripts must handle it: a tool that opens a
 * scene to edit it deserializes the same objects with **no provider registered**, so a script
 * runs there with no world and must simply do nothing. That is what keeps a workspace from
 * simulating while somebody is building in it.
 *
 * ```ts
 * registerScript('walker', (self) => {
 *     const world = getPhysicsWorld3d();
 *     if (!world) return;                          // editing, not playing
 *     useUpdate(() => {
 *         // Looked up per frame: the body is registered as the object is built, so at init it
 *         // may not exist yet.
 *         world.bodyOf(self)?.setLinearVelocity(0, 0, -4);
 *     });
 * });
 * ```
 *
 * Call it while the scene is being built, which is when a script runs, so this is the ordinary
 * case. Outside that there is no active game to compare against and the answer is always `null`.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getPhysicsWorld3d = (): TPhysicsWorldHandle3d | null =>
    owner !== null && owner === getActiveGame() ? current : null;

let warnedNoWorld = false;

/**
 * A hull or triangle-mesh collider naming a shape the scene never loaded. Warned once per name
 * rather than once per body, because a wall of two hundred identical lines says nothing the
 * first one did not.
 */
const warnedGeometry = new Set<string>();
const warnMissingGeometry = (key: string): void => {
    if (warnedGeometry.has(key)) return;
    warnedGeometry.add(key);
    console.warn(
        `[NacatamalOn] A collider is shaped after "${key}", which this scene has not loaded, so ` +
        'it is inert. A collider names a shape the same way anything else that draws one does: ' +
        'put it in the scene\'s manifest.',
    );
};

/**
 * The surface half of a collider, which is identical in every shape, so it is read off the
 * record once rather than spelled out in each of the five branches below.
 */
const surfaceOf = (record: TPhysicsBody3d): TColliderOptions3d => ({
    restitution: record.restitution,
    friction: record.friction,
    density: record.density,
    sensor: record.sensor,
    offset: record.offset,
    layer: record.layer,
    collidesWith: record.collidesWith,
});

/**
 * Moves the physics a scene declares in three dimensions, using box3d.
 *
 * This is the adapter's half of the split: the engine keeps colliders, writes them down and reads
 * them back while deliberately being unable to move them, and registering this is what makes a
 * scene actually fall. Nothing here is needed to **author** physics: a tool opens, edits and saves
 * a scene with none of it installed.
 *
 * It is handed everything a scene declares, whether that came from a file or from a line somebody
 * typed, because the engine records it and then asks. There is nothing here that only one of those
 * two paths goes through.
 *
 * ```ts
 * import { registerPhysicsProvider } from 'nacatamalon/extend';
 * import { box3dProvider } from 'nacatamalon/physics3d';
 *
 * registerPhysicsProvider(box3dProvider);
 * ```
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const box3dProvider: TPhysicsProvider = {
    createWorld: (record: TPhysicsWorld) => {
        // A 2D world in the document is not an error, it is simply not ours: a project can
        // register both adapters and let each answer for its own dimension.
        if (record._type !== 'physics-world-3d') return;

        current = usePhysicsWorld({ gravity: record.gravity });
        owner = getActiveGame();
        warnedNoWorld = false;

        // Without this the pointer outlives its scene, and the next scene's bodies would be
        // added to a world that has already freed its WASM memory.
        //
        // Cleared only if it is still OURS, because a scene transition initializes the incoming
        // scene *before* tearing down the outgoing one: that ordering is what avoids a blank
        // frame while the new room's assets load. By the time this runs, `current` is usually
        // the next scene's world already, and an unconditional `current = null` would erase it,
        // so the room you just walked into would come up with a world nothing can reach.
        const mine = current;
        useSceneUnmount(() => {
            if (current !== mine) return;
            current = null;
            owner = null;
        });
    },

    createBody: (box: TGameObject, record: TPhysicsBody) => {
        if (record._type !== 'physics3d') return;

        if (!current) {
            if (!warnedNoWorld) {
                warnedNoWorld = true;
                console.warn(
                    '[NacatamalOn] An object declares a 3D collider but the scene has no physics ' +
                    'world: give the scene a Physics World 3D of its own. The collider is inert.',
                );
            }
            return;
        }

        bodyIntoWorld(current, box, record);
    },
};

/**
 * Installs this as what simulates the solid half of a scene's physics. **The one line a game
 * writes**, and the only one: everything else about physics is the engine's vocabulary, so a scene
 * says what it is made of and this makes it move.
 *
 * It is a call and not something that happens on import, for three separate reasons, any one of
 * which would be enough. The engine declares itself free of side effects, so a bundler is allowed
 * to drop an import nothing is used from, and a game that worked in development would sit still
 * once built. A tool must be able to open a scene and NOT simulate it, which is what lets you build
 * a level in a workspace that holds still. And a game may install the flat half as well, which it
 * does the same way, by saying so.
 *
 * ```ts
 * import { installPhysics3d } from 'nacatamalon/physics3d';
 *
 * installPhysics3d();
 * ```
 *
 * Installing twice does nothing the second time.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const installPhysics3d = (): void => {
    registerPhysicsProvider(box3dProvider);
};

/**
 * Puts one declared collider into a world.
 *
 * Its own function because this is the whole of what this adapter promises and none of what box3d
 * does: a shape that arrives as the wrong one, or a field quietly dropped on the way, is a bug
 * here, and it can be read without simulating anything.
 *
 * `record.body` is already the backend's vocabulary ('static' | 'dynamic' | 'kinematic'), and that
 * is no coincidence: the engine's type is the set every 2D and 3D engine agrees on, so neither
 * side needs a translation table that can drift.
 *
 * Nothing is written down here, which is the difference from the other engine's adapter: the
 * object already carries its record, because the engine records it and then asks. One way in, so
 * a scene somebody typed and the same scene opened from a file are the same scene, and an adapter
 * cannot forget the half nobody sees.
 *
 * @internal
 */
export const bodyIntoWorld = (world: TPhysicsWorldHandle3d, box: TGameObject, record: TPhysicsBody3d): void => {
    const collider = record.collider;
    const surface = surfaceOf(record);

    switch (collider.shape) {
        case 'box':
            world.addBox(box, { type: record.body, size: collider.size, ...surface });
            break;
        case 'sphere':
            world.addSphere(box, { type: record.body, radius: collider.radius, ...surface });
            break;
        case 'capsule':
            world.addCapsule(box, { type: record.body, radius: collider.radius, height: collider.height, ...surface });
            break;
        case 'hull':
        case 'mesh': {
            // A collider names a shape the same way a model does, so it is resolved the same way:
            // through the game's own store, and not by reaching into what the object draws. A
            // collider may legitimately be shaped after something the object does not draw, which
            // is how a simplified stand-in for a complicated model is done.
            const geometry = getGeometry(collider.geometry);
            if (geometry === null) {
                warnMissingGeometry(collider.geometry);
                break;
            }
            const options = { type: record.body, geometry, ...surface };
            if (collider.shape === 'hull') {
                world.addHull(box, options);
            } else {
                world.addMesh(box, options);
            }
            break;
        }
        default: {
            const never: never = collider;
            return never;
        }
    }
};
