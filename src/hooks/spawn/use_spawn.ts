import { spawnBox } from '../../box';
import type { TBox } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';

/**
 * One thing made by a spawner: what `destroy` takes to remove it whole, with its sprites, its
 * per-frame code and its cleanups.
 *
 * `api` is whatever its component gave back, typed: `TGameObject<{ hurt(): void }>` for an enemy
 * whose component returns `{ hurt }`. Left out, it is `unknown`, which every object is.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGameObject<TApi = unknown> = TBox & { api: TApi };

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
 * **Whatever the component returns is the thing's `api`**, so the one who made it can talk to it:
 * an enemy that returns `{ hurt }` is hurt with `enemy.api.hurt(1)`, typed, with no signal and no
 * lookup. It is there once the maker returns, never while the component is still being run.
 *
 * Call it while the scene is being built, like every hook. It remembers the scene it was called
 * in, so the maker keeps working long after that.
 *
 * @param component The function describing one of these things. Whatever it returns becomes the
 *   new thing's `api`.
 * @param options Where they are placed: see {@link TSpawnOptions}.
 *
 * @example
 * ```ts
 * // An enemy that its level can hurt.
 * const Bat = (x: number) => {
 *     const self = useSelf();
 *     let life = 3;
 *     createSprite({ key: 'bat', transform: { x, y: 120 } });
 *     return {
 *         hurt: (damage: number) => {
 *             life -= damage;
 *             if (life <= 0) destroy(self);
 *         },
 *     };
 * };
 *
 * export const Cave: TSceneFn = () => {
 *     const bat = useSpawn(Bat)(200);
 *     const keys = useKeyboard();
 *
 *     useUpdate(() => {
 *         if (keys.justPressed('x')) bat.api.hurt(1);
 *     });
 *
 *     return createScene();
 * };
 * ```
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
 *   object, for `destroy`, with what the component returned as its `api`.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSpawn = <TArgs extends unknown[], TApi>(
    component: (...args: TArgs) => TApi,
    options: TSpawnOptions = {},
): ((...args: TArgs) => TGameObject<TApi>) => {
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

    return (...args: TArgs) => {
        let api: TApi | undefined;
        const box = spawnBox(store, parentOf(), name, (...given: TArgs) => {
            api = component(...given);
        }, args);
        // Set once the body is over rather than from inside it: until then there is nothing whole
        // to talk to, and a body that threw has never reached here.
        box.api = api;
        return box as TGameObject<TApi>;
    };
};
