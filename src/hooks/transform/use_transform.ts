import { getActiveBox } from '../../store';
import type { TTransform3d } from '../../gameobjects/types/t_transform_3d';

/**
 * Where to put something, and everything inside it.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTransformOptions = Partial<TTransform3d>;

/**
 * Nowhere in particular: at the origin, unturned, unscaled.
 */
const NOWHERE: TTransform3d = { x: 0, y: 0, z: 0, rotation: 0, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 };

/**
 * Gives this object a place of its own, and **moves everything inside it**.
 *
 * Without it, each sprite, text or model carries its own position and they are moved one by one.
 * With it, they are placed once, relative to the object, and moving the object moves all of them
 * together: a turret and its barrel, a card and its number, a ship and everything bolted to it.
 * Anything made inside this one is placed relative to it too, however deep it goes.
 *
 * What comes back is the placement itself, so changing it is all it takes and it takes effect on
 * the next frame drawn. `rotation` turns it in the plane, which is the only one a 2D game needs;
 * `rotationX` and `rotationY` are for three dimensions.
 *
 * For something free to point anywhere there is `quaternion`, and setting one puts the three angles
 * aside: `Quat.fromEuler` starts one off facing the same way they did, and `Quat.slerp` eases from
 * one facing to another without the wobble that easing three angles gives. Note that it speaks for
 * three dimensions only: pictures and writing inside this one are still turned by `rotation`.
 *
 * Asking twice gives back the same placement, so a later call never quietly throws away where
 * something already was.
 *
 * @param options Where to start. Anything left out starts at the origin, unturned and unscaled.
 * @returns The placement, to read and to change.
 *
 * @example
 * ```ts
 * const Turret = (x: number) => {
 *     const place = useTransform({ x, y: 200 });
 *
 *     // Both are placed relative to the turret, so turning it turns them together.
 *     createSprite({ key: 'base', transform: { x: 0, y: 0 } });
 *     createSprite({ key: 'barrel', transform: { x: 0, y: -12 } });
 *
 *     useUpdate((delta) => {
 *         place.rotation += delta;
 *     });
 * };
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useTransform = (options: TTransformOptions = {}): TTransform3d => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useTransform: call it inside a scene body, or inside something created with useSpawn.');
    }

    // Already placed: the same one back, never a second one. Two calls asking for different places
    // would otherwise make which one wins depend on the order they were written in.
    if (box.transform !== null) {
        return box.transform;
    }

    box.transform = { ...NOWHERE, ...options };
    return box.transform;
};
