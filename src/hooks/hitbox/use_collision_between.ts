import { getActiveBox } from '../../store';
import { collisionKey } from '../../hitbox/collision_key';
import type { TCollisionListener, TCollisionMatch, TCollisionMatched } from '../../hitbox/types/t_hitbox';

/**
 * Calls `callback` for every thing of kind `a` touching one of kind `b`, every frame they touch: a
 * rule of the scene, shots against enemies, the player against coins. A piece says itself what it
 * collides with with `useCollisionWith`; this is for the scene that knows both. Each kind is a
 * component, whose pieces come with their `api` typed, or a tag, as in `useCollisionWith`.
 *
 * Run once every `useUpdate` of the scene is over, before `useLateUpdate`, measured as
 * `collisionBetween` measures. The two come in the order the tags were named. Once one is destroyed
 * it is not called with again, so a bullet hits one enemy and not the three behind it. A tag can be
 * named twice, `useCollisionBetween('enemy', 'enemy', ...)`, and each pair comes once. Stops when
 * what registered it goes away; not while its scene is paused.
 *
 * @param a One kind: a component, or a tag.
 * @param b The other.
 * @param callback What to do with each pair, in that order.
 * @returns A function that stops it earlier.
 *
 * @example
 * ```ts
 * declare const Bat: (props: { x: number }) => { hurt(damage: number): void };
 *
 * export const Cave: TSceneFn = () => {
 *     useSpawn(Bat)({ x: 200 });
 *     useCollisionBetween('shot', Bat, (shot, bat) => {
 *         destroy(shot);
 *         bat.api.hurt(1);
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCollisionBetween = <A extends TCollisionMatch, B extends TCollisionMatch>(
    a: A,
    b: B,
    callback: (a: TCollisionMatched<A>, b: TCollisionMatched<B>) => void,
): (() => void) => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useCollisionBetween: call it inside a scene body, not from a timer or a callback.');
    }
    const listener: TCollisionListener = { kind: 'between', a: collisionKey(a), b: collisionKey(b), callback: callback as (a: unknown, b: unknown) => void };
    box.collisionCallbacks.push(listener);
    return () => {
        const at = box.collisionCallbacks.indexOf(listener);
        if (at >= 0) {
            box.collisionCallbacks.splice(at, 1);
        }
    };
};
