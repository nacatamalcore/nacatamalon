import { getActiveBox } from '../../store';
import type { TGameObject } from '../spawn/use_spawn';
import type { TOverlapListener } from '../../hitbox/types/t_hitbox';

/**
 * Calls `callback` for every object of group `a` touching one of group `b`, every frame they touch:
 * shots against enemies, the player against coins, enemies against the player.
 *
 * It runs once every `useUpdate` of the scene is over, so things are compared where they ended up,
 * and before `useLateUpdate`. The two objects come in the order the groups were named.
 *
 * **Every frame they touch, not only the first.** A hero blinking inside an enemy after a hit has to
 * be hurt again when the blinking ends, and that is the game's to decide; so is a bullet or a coin
 * being destroyed on its first call. Once one of the two is destroyed it is not called with it again,
 * so a bullet hits one enemy and not the three behind it. A hitbox that is off is never touched.
 *
 * A group can be named twice, `useOverlap('enemy', 'enemy', ...)`, and each pair comes once. It
 * stops by itself when the part of the scene that registered it goes away, and is not called while
 * its scene is paused.
 *
 * @param a One group.
 * @param b The other group.
 * @param callback What to do with each pair: the object of `a`, then the object of `b`. Their
 *   `api` is `unknown` unless the two types are named, `useOverlap<TShot, TBat>(...)`.
 * @returns A function that stops it earlier.
 *
 * @example
 * ```ts
 * declare const Bat: (x: number) => { hurt(damage: number): void };
 *
 * export const Cave: TSceneFn = () => {
 *     useSpawn(Bat)(200);
 *     // The second group's api is named, so the enemy can be hurt with no cast.
 *     useOverlap<unknown, ReturnType<typeof Bat>>('playerShot', 'enemy', (shot, enemy) => {
 *         destroy(shot);
 *         enemy.api.hurt(1);
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useOverlap = <TApiA = unknown, TApiB = unknown>(
    a: string,
    b: string,
    callback: (a: TGameObject<TApiA>, b: TGameObject<TApiB>) => void,
): (() => void) => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useOverlap: call it inside a scene body, not from a timer or a callback.');
    }
    const listener: TOverlapListener = { a, b, callback: callback as TOverlapListener['callback'] };
    box.overlapCallbacks.push(listener);
    return () => {
        const at = box.overlapCallbacks.indexOf(listener);
        if (at >= 0) {
            box.overlapCallbacks.splice(at, 1);
        }
    };
};
