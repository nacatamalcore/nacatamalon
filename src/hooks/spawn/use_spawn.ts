import { spawnBox } from '../../box';
import type { TBox } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';

/**
 * One thing made by a spawner: what `destroy` takes to remove it whole, with its sprites, its
 * per-frame code and its cleanups.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameObject = TBox;

/**
 * Where the things a maker makes are placed.
 *
 * Left out, each one hangs under whoever is making it: a tank that makes its own turret carries
 * it along. `'scene'` puts it at the top of the scene instead, which is what a shot fired from a
 * cannon wants, since it must not swing round with the barrel once it has left. Or any thing
 * already in the scene, to hang under that one.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpawnOptions = {
    parent?: 'scene' | TGameObject;
};

/**
 * Prepares a maker for `component`, so the scene can create as many of them as it likes, whenever
 * it likes: while it is being built, from a frame, from a timer, from a click.
 *
 * **This is what gives each one a life of its own.** Calling `Bullet(10)` yourself is an ordinary
 * function call, and the `useUpdate` inside it belongs to whoever called it, mixed in with
 * everything else there. Made through the maker, each bullet gets its own place: its sprites, its
 * per-frame code and its cleanups are *its*, and `destroy` can take exactly one of them away.
 *
 * Whatever you pass to the maker reaches the component as its arguments. What comes back is the
 * thing itself, for later: keep it to destroy it, or let the component end its own life with
 * `useSelf`.
 *
 * Call it while the scene is being built, like every hook. It remembers the scene it was called
 * in, so the maker keeps working long after that.
 *
 * @param component The function describing one of these things. Whatever it returns is ignored.
 * @param options Where they are placed: see {@link TSpawnOptions}.
 *
 * @example
 * ```ts
 * declare const gun: TSprite;
 * declare let firing: boolean;
 *
 * const Bullet = (x: number) => {
 *     const self = useSelf();
 *     const sprite = createSprite({ key: 'bullet', transform: { x, y: 200 } });
 *
 *     useUpdate((delta) => {
 *         sprite.transform.y -= 300 * delta;
 *         if (sprite.transform.y < 0) {
 *             destroy(self);
 *         }
 *     });
 * };
 *
 * export const Level: TSceneFn = () => {
 *     const spawnBullet = useSpawn(Bullet);
 *
 *     useUpdate(() => {
 *         if (firing) spawnBullet(gun.transform.x);
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @returns The maker. Call it with whatever `component` takes to make one; it returns the new
 *   object, for `destroy`.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSpawn = <TArgs extends unknown[]>(
    component: (...args: TArgs) => unknown,
    options: TSpawnOptions = {},
): ((...args: TArgs) => TGameObject) => {
    const store = getActiveGame();
    const active = getActiveBox();
    if (store === null || active === null) {
        throw new Error('[NacatamalOn] useSpawn: call it inside a scene body.');
    }

    // Looked up at each spawn rather than now: while a scene is still being built, the thing
    // calling this may not be hung in it yet.
    const parentOf = (): TBox => {
        if (options.parent === undefined) {
            return active;
        }
        if (options.parent !== 'scene') {
            return options.parent;
        }
        let top = active;
        while (top.parent !== null) {
            top = top.parent;
        }
        return top;
    };

    // The name is the component's own, which is what shows up in a warning about a cleanup that
    // threw. An anonymous function still has to be called something.
    const name = component.name.length > 0 ? component.name : 'spawned';

    return (...args: TArgs) => spawnBox(store, parentOf(), name, component as (...args: TArgs) => void, args);
};
