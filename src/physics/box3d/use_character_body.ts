import { getActiveBox as getActiveGameObject } from '../../store';
import { getPhysicsWorld3d } from './provider';
import type { TCharacterBody, TCharacterOptions } from './character_body';

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
 * Set `velocity` and it walks. Falling is applied for you, and `isGrounded` is the answer to
 * whether it may jump.
 *
 * `null` when the scene has no physics world, which is what a tool opening a scene to edit it
 * looks like. Handle it the way you would handle `getPhysicsWorld3d()` coming back empty: do
 * nothing, because nothing is running.
 *
 * ```ts
 * const Player = () => {
 *     useTransform({ x: 0, y: 1, z: 0 });
 *     createMesh({ geometry: useUvSphereGeometry({ radius: 0.35 }), tint: BLUE });
 *
 *     const player = useCharacterBody({ radius: 0.35, height: 1.8 });
 *     const keys = useKeyboard();
 *     useUpdate(() => {
 *         if (!player) return;
 *         player.velocity.x = keys.isDown('d') ? 4 : keys.isDown('a') ? -4 : 0;
 *         if (keys.isDown('Space') && player.isGrounded) player.velocity.y = 5;
 *     });
 * };
 * ```
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCharacterBody = (options: TCharacterOptions): TCharacterBody | null => {
    const box = getActiveGameObject();
    if (box === null) {
        throw new Error('[NacatamalOn] useCharacterBody: call it inside a scene body.');
    }

    // Asked for while the scene is being built, which is the only time it can be answered, and
    // kept: unlike a body, a character is not registered anywhere to be looked up again later.
    const world = getPhysicsWorld3d();
    return world === null ? null : world.addCharacter(box, options);
};
