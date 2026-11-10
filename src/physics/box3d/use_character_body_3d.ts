import { getActiveBox as getActiveGameObject, getActiveGame } from '../../store';
import { firstTimeIn } from '../../utils/first_time_in';
import { getPhysicsProviders } from '../physics_provider';
import { getPhysicsWorld3d } from './provider';
import type { TCharacterBody3d, TCharacterOptions3d } from './character_body';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * A character that is not simulated: what a scene opened in a tool gets, where nothing is.
 */
const inert = (): TCharacterBody3d => ({
    velocity: { x: 0, y: 0, z: 0 },
    isOnGround: false,
    setPosition: () => {},
    destroy: () => {},
});

/**
 * Makes this object a **walking character**: a capsule moved by asking the world what is in the
 * way, and the thing that makes a room walkable.
 *
 * It is the one part of physics that a scene cannot write down, and that is not an oversight. A
 * crate is a shape with a weight, and a file can say so. A character is a decision taken sixty
 * times a second about where a body is allowed to be: it climbs a step without jumping, walks up a
 * ramp and not up a wall, and stops dead against a crate instead of tipping over it. None of that
 * is a property of the object, so there is nothing for a scene to keep, and steering one with
 * forces gives you something that slides on slopes and falls over on its face.
 *
 * Set `velocity` and it walks. Falling is applied for you, and `isOnGround` is the answer to
 * whether it may jump.
 *
 * With no world to walk in, as in a tool opening the scene to edit it, it is a character that never
 * moves, so the game's code runs the same and nothing happens. When physics is installed and the
 * scene forgot its world, it says so once.
 *
 * ```ts
 * const Player = () => {
 *     useTransform({ x: 0, y: 1, z: 0 });
 *     createMesh({ geometry: useSphereGeometry({ radius: 0.35 }), tint: BLUE });
 *
 *     const player = useCharacterBody3d({ radius: 0.35, height: 1.8 });
 *     const keys = useKeyboard();
 *     useUpdate(() => {
 *         player.velocity.x = keys.isDown('d') ? 4 : keys.isDown('a') ? -4 : 0;
 *         if (keys.isDown('Space') && player.isOnGround) player.velocity.y = 5;
 *     });
 * };
 * ```
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCharacterBody3d = (options: TCharacterOptions3d): TCharacterBody3d => {
    const box = getActiveGameObject();
    if (box === null) {
        throw outsideSceneBody('useCharacterBody3d');
    }

    // Asked for while the scene is being built, which is the only time it can be answered, and
    // kept: unlike a body, a character is not registered anywhere to be looked up again later.
    const world = getPhysicsWorld3d();
    if (world === null) {
        // Nothing installed is a tool showing the scene, and is said by nobody. Installed and still no
        // world is a scene that forgot to declare one.
        if (getPhysicsProviders().length > 0 && firstTimeIn(getActiveGame(), 'useCharacterBody3d: no world')) {
            console.warn('[NacatamalOn] useCharacterBody3d: the scene has no 3D world, so the character never moves. Call usePhysicsWorld3d() in the scene\'s body, before what is in it.');
        }
        return inert();
    }
    return world.addCharacter(box, options);
};
