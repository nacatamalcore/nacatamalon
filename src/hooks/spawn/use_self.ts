import { getActiveBox } from '../../store';
import type { TGameObject } from './use_spawn';

/**
 * The thing being built right now, so it can refer to itself later: almost always to end its own
 * life once it has done its job.
 *
 * Inside a component made by a spawner, this is that one thing. Inside a scene body it is the
 * scene, which cannot be destroyed this way: a scene leaves through `useScene().stop()`.
 *
 * Call it while the thing is being built, like every hook, and keep what it returns.
 *
 * @example
 * ```ts
 * const Spark = () => {
 *     const self = useSelf();
 *     let left = 0.4;
 *
 *     useUpdate((delta) => {
 *         left -= delta;
 *         if (left <= 0) {
 *             destroy(self);
 *         }
 *     });
 * };
 * ```
 *
 * @returns The object being built.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSelf = (): TGameObject => {
    const self = getActiveBox();
    if (self === null) {
        throw new Error('[NacatamalOn] useSelf: call it inside a scene body.');
    }
    return self;
};
