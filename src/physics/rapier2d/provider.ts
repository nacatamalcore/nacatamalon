import { useSceneUnmount } from '../../hooks/scene/use_scene_unmount';
import { getActiveGame } from '../../store';
import { registerPhysicsProvider } from '../physics_provider';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TPhysicsBody, TPhysicsBody2d, TPhysicsWorld } from '../types/t_physics';
import type { TRuntimeStore } from '../../store';
import type { TPhysicsProvider } from '../physics_provider';
import { usePhysicsWorld } from './physics_world';
import type { TPhysicsWorldHandle2d, TColliderSurface2d } from './types';

/**
 * The world the current scene's document declared, if any. Module state because the provider
 * is a single registered object while worlds come and go with scenes: `createWorld` opens
 * one, `createBody` adds to it, and the scene's teardown closes it.
 */
let current: TPhysicsWorldHandle2d | null = null;

/**
 * The game `current` belongs to.
 *
 * A world outlives the deserialization that built it, and `useSceneUnmount` only clears the
 * pointer when that scene is torn down *properly*. Two situations are not that: the editor runs
 * a second engine instance for Play alongside the live one, and a scene can simply be abandoned.
 * In both, a bare module pointer keeps answering with a world belonging to somewhere else, which is the
 * failure the 3D adapter hit first, and the reason this is here before anything trips over it in
 * 2D.
 */
let owner: TRuntimeStore | null = null;

/**
 * The 2D physics world the running scene's **document** built, or `null` if it has none.
 *
 * The seam between authored data and authored behaviour, and the 2D twin of the 3D adapter's
 * accessor of the same name. A collider is data: the document declares it and this provider
 * simulates it, no code on either side. Steering is not: a script attached to a box has no way
 * to name the world the scene root declared, because that world never passed through the
 * document. Without this the only reachable world is one the script opens itself, which is a
 * *second* world with its own gravity and its own bodies, colliding with nothing in the scene.
 *
 * Pair it with `world.bodyOf(box)` to reach the box's own collider: the document built the
 * body, so the handle `addRect` returned went to this provider and never to the game.
 *
 * `null` is the ordinary answer, not an error, and scripts must handle it: the editor's edit
 * viewport deserializes the same document with **no provider registered** (see `play.ts`), so a
 * script runs there with no world and must simply do nothing. That is what keeps the workspace
 * from simulating while you author in it.
 *
 * ```ts
 * registerScript('walker', (self) => {
 *     const world = getPhysicsWorld2d();
 *     if (!world) return;                          // editing, not playing
 *     useUpdate(() => {
 *         // Looked up per frame: the body is registered as the box is built, so at init it may
 *         // not exist yet.
 *         world.bodyOf(self)?.setLinearVelocity(120, 0);
 *     });
 * });
 * ```
 *
 * Call it during scene init, which is when a script runs, so this is the ordinary case. Outside
 * init there is no active game to compare against and the answer is always `null`.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getPhysicsWorld2d = (): TPhysicsWorldHandle2d | null =>
    owner !== null && owner === getActiveGame() ? current : null;

let warnedNoWorld = false;

/**
 * The surface half of a collider, which is identical in every shape, so it is read off the
 * record once rather than spelled out in each of the three branches below.
 */
const surfaceOf = (record: TPhysicsBody): TColliderSurface2d => ({
    restitution: record.restitution,
    friction: record.friction,
    density: record.density,
    sensor: record.sensor,
    layer: record.layer,
    collidesWith: record.collidesWith,
});

/**
 * Moves the physics a scene declares, using Rapier2D.
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
 * import { rapier2dProvider } from 'nacatamalon/physics2d';
 *
 * registerPhysicsProvider(rapier2dProvider);
 * ```
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rapier2dProvider: TPhysicsProvider = {
    createWorld: (record: TPhysicsWorld) => {
        // A 3D world in the document is not an error, it is simply not ours: a project can
        // register both adapters and let each answer for its own dimension.
        if (record._type !== 'physics-world-2d') return;

        current = usePhysicsWorld({ gravity: record.gravity });
        owner = getActiveGame();
        warnedNoWorld = false;

        // Without this the pointer outlives its scene, and the next scene's bodies would be
        // added to a world that has already freed its WASM memory.
        //
        // Cleared only if it is still OURS, because a scene transition initializes the incoming
        // scene *before* tearing down the outgoing one, and that ordering is what avoids a blank
        // frame while the new room's assets load. By the time this runs, `current` is usually
        // the next scene's world already, and an unconditional `current = null` would erase it:
        // the room you just walked into would come up with a world nothing can reach.
        const mine = current;
        useSceneUnmount(() => {
            if (current !== mine) return;
            current = null;
            owner = null;
        });
    },

    createBody: (box: TGameObject, record: TPhysicsBody) => {
        if (record._type !== 'physics2d') return;

        if (!current) {
            if (!warnedNoWorld) {
                warnedNoWorld = true;
                console.warn(
                    '[NacatamalOn] A box declares a 2D collider but the scene has no physics ' +
                    'world: add a Physics World 2D component to the scene root. The collider ' +
                    'is inert.',
                );
            }
            return;
        }

        bodyIntoWorld(current, box, record);
    },
};

/**
 * Installs this as what simulates the flat half of a scene's physics. **The one line a game
 * writes**, and the only one: everything else about physics is the engine's vocabulary, so a scene
 * says what it is made of and this makes it move.
 *
 * It is a call and not something that happens on import, for three separate reasons, any one of
 * which would be enough. The engine declares itself free of side effects, so a bundler is allowed
 * to drop an import nothing is used from, and a game that worked in development would sit still
 * once built. A tool must be able to open a scene and NOT simulate it, which is what lets you build
 * a level in a workspace that holds still. And a game may install the solid half as well, which it
 * does the same way, by saying so.
 *
 * ```ts
 * import { installPhysics2d } from 'nacatamalon/physics2d';
 *
 * installPhysics2d();
 * ```
 *
 * Installing twice does nothing the second time.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const installPhysics2d = (): void => {
    registerPhysicsProvider(rapier2dProvider);
};

/**
 * Puts one declared collider into a world.
 *
 * Its own function because this is the whole of what this adapter promises and none of what Rapier
 * does: a shape that arrives as the wrong one, or a field quietly dropped on the way, is a bug
 * here, and it can be read without simulating anything.
 *
 * `record.body` is already Rapier's vocabulary ('static' | 'dynamic' | 'kinematic'), and that is
 * no coincidence: the engine's type is the set every 2D and 3D engine agrees on, so neither side
 * needs a translation table that can drift.
 *
 * Nothing is written down here, which is the difference from the other engine's adapter: the
 * object already carries its record, because the engine records it and then asks. One way in, so
 * a scene somebody typed and the same scene opened from a file are the same scene, and an adapter
 * cannot forget the half nobody sees.
 *
 * @internal
 */
export const bodyIntoWorld = (world: TPhysicsWorldHandle2d, box: TGameObject, record: TPhysicsBody2d): void => {
    const collider = record.collider;
    const surface = surfaceOf(record);

    switch (collider.shape) {
        case 'rect':
            world.addRect(box, { type: record.body, width: collider.width, height: collider.height, ...surface });
            break;
        case 'circle':
            world.addCircle(box, { type: record.body, radius: collider.radius, ...surface });
            break;
        case 'polygon':
            world.addPolygon(box, { type: record.body, vertices: collider.vertices, ...surface });
            break;
        default: {
            const never: never = collider;
            return never;
        }
    }
};
