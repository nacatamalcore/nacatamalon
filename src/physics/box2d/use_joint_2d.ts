import { getActiveBox, getActiveGame } from '../../store';
import { firstTimeIn } from '../../utils/first_time_in';
import { getPhysicsProviders } from '../physics_provider';
import { getPhysicsWorld2d } from './provider';
import type { TGameObject } from '../../hooks/spawn/use_spawn';
import type { TJoint2d, TJointHandle2d } from './t_joint_2d';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * Joins two objects' bodies, or one to a point of the world when `b` is `null`: the planks of a
 * bridge, a pendulum on its nail, a platform on a spring, a door on its hinge.
 *
 * Both objects need a body (`usePhysicsBody2d`) in the scene's 2D world. Points are given where the
 * scene lays things out, in the world, so a bridge's planks are pinned where they meet. The two
 * joined bodies do not collide with each other unless the joint says `collide: true`.
 *
 * A bridge wants three things to hang still: a little slack (planks a touch longer than the gap, so it
 * sags), a little `friction` in its hinges, and its ends pinned a pixel or two off the banks, since a
 * plank flush against a wall rubs on it and never settles.
 *
 * The joint goes with whichever of its objects is destroyed first, and earlier with `destroy()`.
 * Call it while the scene is built; to join things later (a hook thrown mid-jump), keep the world
 * from `getPhysicsWorld2d()` and call its `addJoint`. Where nothing simulates, it joins nothing.
 *
 * @param a One object.
 * @param b The other, or `null` for a fixed point of the world.
 * @param joint How they are joined: see {@link TJoint2d}.
 * @returns The joint, to let go of.
 *
 * @example
 * ```ts
 * import { createScene, createSprite, usePhysicsBody2d, usePhysicsWorld2d, useSpawn } from 'nacatamalon';
 * import { useJoint2d } from 'nacatamalon/physics2d';
 * import type { TGameObject, TSceneFn } from 'nacatamalon';
 *
 * // A bridge of eight planks between two ledges, pinned to the world at both ends.
 * const Plank = (x: number) => {
 *     createSprite({ key: 'plank', transform: { x, y: 120 } });
 *     usePhysicsBody2d({ body: 'dynamic', collider: { shape: 'rect', width: 16, height: 4 } });
 * };
 *
 * export const River: TSceneFn = () => {
 *     usePhysicsWorld2d();
 *     const spawnPlank = useSpawn(Plank);
 *     const planks: TGameObject[] = [];
 *     for (let i = 0; i < 8; i++) planks.push(spawnPlank(72 + i * 16));
 *
 *     useJoint2d(planks[0], null, { type: 'hinge', at: { x: 64, y: 120 } });
 *     for (let i = 1; i < planks.length; i++) {
 *         useJoint2d(planks[i - 1], planks[i], { type: 'hinge', at: { x: 64 + i * 16, y: 120 } });
 *     }
 *     useJoint2d(planks[7], null, { type: 'hinge', at: { x: 64 + 8 * 16, y: 120 } });
 *     return createScene();
 * };
 * ```
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useJoint2d = (a: TGameObject, b: TGameObject | null, joint: TJoint2d): TJointHandle2d => {
    if (getActiveBox() === null) {
        throw outsideSceneBody('useJoint2d', 'To join things later, call addJoint on the world from getPhysicsWorld2d().');
    }
    const world = getPhysicsWorld2d();
    if (world === null) {
        if (getPhysicsProviders().length > 0 && firstTimeIn(getActiveGame(), 'useJoint2d: no world')) {
            console.warn('[NacatamalOn] useJoint2d: the scene has no 2D world, so nothing is joined. Call usePhysicsWorld2d() in the scene\'s body, before what is in it.');
        }
        return { destroy: () => {} };
    }
    return world.addJoint(a, b, joint);
};
