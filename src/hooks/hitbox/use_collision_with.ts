import { getActiveBox } from '../../store';
import { collisionKey } from '../../hitbox/collision_key';
import type { TCollisionListener, TCollisionMatch, TCollisionMatched, TCollisionWhen } from '../../hitbox/types/t_hitbox';

/**
 * What `useCollisionWith` takes besides what it collides with and what to do.
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCollisionWithOptions = {
    /**
     * When it calls: `'touching'` every frame the two touch (the default), `'start'` on the first,
     * `'end'` on the first they no longer do.
     */
    when?: TCollisionWhen;
};

/**
 * Calls `callback` with each thing the object being built touches, of one kind: a bullet and the
 * enemies, the player and the coins. The piece says itself what it collides with, so a bullet and
 * an enemy written apart need no rule in the scene that knows them both.
 *
 * The kind is a component or a tag. **A component** (`useCollisionWith(Enemy, ...)`) meets the pieces
 * `useSpawn` made from it, and gives each with its `api` typed. **A tag** (`'damageable'`, or what
 * `useTag` gives) meets everything carrying it, pieces of any kind and sprites, texts or panels
 * tagged on their own, so what comes is either: `'api' in thing` tells. A tag is also what a saved
 * scene and the editor can name.
 *
 * Measured as `collisionBetween` measures: a piece by its hitboxes that are on, or by what it draws
 * when it has none; a sprite, text or panel by itself. Two pieces with physics bodies also touch
 * when the simulation says so, in 2D and in 3D, so the same line works whether a hitbox or a body
 * tells it. Run with the scene's other collisions, once its updates are over; not while it is
 * paused. Stops when the object goes away.
 *
 * @param match What it collides with: a component, or a tag.
 * @param callback What to do with each one.
 * @param options When to call: see {@link TCollisionWithOptions}.
 * @returns A function that stops it earlier.
 *
 * @example
 * ```ts
 * declare const Bat: () => { hurt(damage: number): void };
 *
 * const Bullet = ({ x }: { x: number }) => {
 *     const self = useSelf();
 *     createSprite({ width: 4, height: 4, transform: { x, y: 200 } });
 *     useHitbox();
 *     useCollisionWith(Bat, (bat) => {
 *         destroy(self);
 *         bat.api.hurt(1);
 *     });
 * };
 * ```
 *
 * @category Hitboxes
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCollisionWith = <M extends TCollisionMatch>(
    match: M,
    callback: (other: TCollisionMatched<M>) => void,
    options: TCollisionWithOptions = {},
): (() => void) => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useCollisionWith: call it inside a component made with useSpawn or a scene body, not from a timer or a callback.');
    }
    const listener: TCollisionListener = {
        kind: 'with',
        match: collisionKey(match),
        when: options.when ?? 'touching',
        callback: callback as (other: unknown) => void,
        touching: new Set(),
    };
    box.collisionCallbacks.push(listener);
    return () => {
        const at = box.collisionCallbacks.indexOf(listener);
        if (at >= 0) {
            box.collisionCallbacks.splice(at, 1);
        }
    };
};
