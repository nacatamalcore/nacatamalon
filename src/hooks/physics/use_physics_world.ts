import { getActiveBox } from '../../store';
import { getPhysicsProviders, warnMissingPhysicsProvider } from '../../physics';
import { nanoId } from '../../utils';
import type { TPhysicsWorld2d, TPhysicsWorld3d } from '../../physics';
import { isShowingOnly } from './is_showing_only';

/**
 * Opens the flat simulation for this scene, and says how hard things fall.
 *
 * Called in the **scene's body**, because gravity belongs to the scene and not to anything in it: a
 * scene seen from above has none and a platformer does. Called anywhere else it is recorded on that
 * object and nothing reads it, which is said out loud rather than ignored.
 *
 * `gravity` is in pixels per second squared with **+y pointing down**, which is the way a sprite's
 * y axis grows, so earth-ish is about `900` and positive.
 *
 * Like a collider, this is worth calling with nothing installed to simulate: the scene records what
 * it wants and comes back with it.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     usePhysicsWorld2d({ gravity: { x: 0, y: 900 } });
 *     // ...then objects with usePhysicsBody2d, which fall in it.
 *     return createScene();
 * };
 * ```
 *
 * @param options - How hard things fall (`gravity`, in pixels per second squared, +y down), and an
 *   `id` for a scene with more than one.
 * @returns The world's settings as the scene keeps them.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const usePhysicsWorld2d = (options: { id?: string; gravity?: { x: number; y: number } } = {}): TPhysicsWorld2d => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] usePhysicsWorld2d: call it inside a scene body.');
    }
    if (box.parent !== null) {
        console.warn(`[NacatamalOn] usePhysicsWorld2d: '${box.name}' is not a scene, and only a scene's simulation is read. Call it in the scene's own body.`);
    }

    const world: TPhysicsWorld2d = {
        _type: 'physics-world-2d',
        id: options.id ?? nanoId(),
        gravity: options.gravity ?? { x: 0, y: 900 },
    };
    box.physicsWorld = world;

    // Shown, not played: written down and not simulated.
    if (isShowingOnly()) {
        return world;
    }
    const installed = getPhysicsProviders();
    if (installed.length === 0) {
        warnMissingPhysicsProvider();
        return world;
    }
    for (const provider of installed) {
        provider.createWorld(world);
    }
    return world;
};

/**
 * Opens the simulation in three dimensions for this scene. See {@link usePhysicsWorld2d}.
 *
 * `gravity` is in metres per second squared with **+y up**, so earth is `-9.81`: the opposite sign
 * from the flat one, because there a placement's y grows downwards. The two disagree on purpose.
 *
 * @param options - How hard things fall (`gravity`, per second squared), and an `id` for a scene
 *   with more than one.
 * @returns The world's settings as the scene keeps them.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const usePhysicsWorld3d = (options: { id?: string; gravity?: { x: number; y: number; z: number } } = {}): TPhysicsWorld3d => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] usePhysicsWorld3d: call it inside a scene body.');
    }
    if (box.parent !== null) {
        console.warn(`[NacatamalOn] usePhysicsWorld3d: '${box.name}' is not a scene, and only a scene's simulation is read. Call it in the scene's own body.`);
    }

    const world: TPhysicsWorld3d = {
        _type: 'physics-world-3d',
        id: options.id ?? nanoId(),
        gravity: options.gravity ?? { x: 0, y: -9.81, z: 0 },
    };
    box.physicsWorld = world;

    // Shown, not played: written down and not simulated.
    if (isShowingOnly()) {
        return world;
    }
    const installed = getPhysicsProviders();
    if (installed.length === 0) {
        warnMissingPhysicsProvider();
        return world;
    }
    for (const provider of installed) {
        provider.createWorld(world);
    }
    return world;
};
