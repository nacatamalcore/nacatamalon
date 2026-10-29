import { markMadeBy, markNamedByFunction, newBox, spawnBox } from '../../box';
import type { TBox } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { isSceneStopped } from '../../scene/stopped_scenes';
import { outsideSceneBody } from '../../utils/outside_scene_body';

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
 * What every thing a maker makes is called, and where it is placed. A string alone is the name,
 * the usual case: `useSpawn(Button, 'Jump')`.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpawnOptions = {
    /**
     * What each one is called, for whatever finds it by name: a touch button's action
     * (`{ type: 'touch', box: 'Jump' }`), `findObject`, a script's field. Left out, it is the
     * component's function name, which is only a label for warnings: a published build shortens
     * function names, so `function Jump` may ship as `c`, and a renamed function would rename it
     * too. Anything looked up by name needs it written here.
     */
    name?: string;
    /**
     * What each one is, as `useTag` says it: `['coin']`. The same as `useTag('coin').add(useSelf())`
     * in its body, and there before the body runs.
     */
    tags?: string[];
    /**
     * Left out, each one hangs under whoever is making it: a tank that makes its own turret carries
     * it along. `'scene'` puts it at the top of the scene instead, which is what a shot fired from a
     * cannon wants, since it must not swing round with the barrel once it has left. Or any thing
     * already in the scene, to hang under that one.
     */
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
 * Whatever you pass to the maker reaches the component as its arguments: one object of props,
 * `makeBullet({ x: 10 })`, reads like the tag it stands for and keeps its names. They arrive once,
 * when the thing is made; the component is not run again when they change. What comes back is the
 * thing itself, for later: keep it to destroy it, or let the component end its own life with
 * `useSelf`.
 *
 * **What is the same for every one goes to `useSpawn`, what changes from one to the next to the
 * maker**: the name and the place are decided once, here, while the scene is built; the props are
 * given to each one, whenever it is made. Two buttons of one component with names of their own are
 * two makers, which cost nothing.
 *
 * **Whatever the component returns is the thing's `api`**, so the one who made it can talk to it:
 * an enemy that returns `{ hurt }` is hurt with `enemy.api.hurt(1)`, typed, with no signal and no
 * lookup. It is there once the maker returns, never while the component is still being run.
 *
 * **Call `useSpawn` while the scene is being built, like every hook, and the maker whenever**: from
 * `useUpdate`, a timer or a listener, which is how things are made while the game runs. It remembers
 * the scene it was called in, so the maker keeps working for as long as that scene runs. Called once the
 * scene has stopped (from a `setTimeout` or a listener that outlived it), it makes nothing, says so
 * once, and gives back something already destroyed; under something destroyed, the same in silence.
 *
 * @param component The function describing one of these things. Whatever it returns becomes the
 *   new thing's `api`.
 * @param options What they are called and where they are placed, or the name alone: see
 *   {@link TSpawnOptions}.
 *
 * @example
 * ```ts
 * // An enemy that its level can hurt.
 * const Bat = ({ x }: { x: number }) => {
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
 *     const bat = useSpawn(Bat, 'Bat')({ x: 200 });
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
 * const Bullet = ({ x }: { x: number }) => {
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
 *     // Shots leave the gun behind, so they hang from the scene.
 *     const spawnBullet = useSpawn(Bullet, { name: 'Bullet', parent: 'scene' });
 *
 *     useUpdate(() => {
 *         if (firing) spawnBullet({ x: gun.transform.x });
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
    given: string | TSpawnOptions = {},
): ((...args: TArgs) => TGameObject<TApi>) => {
    const options: TSpawnOptions = typeof given === 'string' ? { name: given } : given;
    const store = getActiveGame();
    const active = getActiveBox();
    if (store === null || active === null) {
        throw outsideSceneBody('useSpawn');
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

    // Without one given, the component's own, which is what shows up in a warning about a cleanup
    // that threw. An anonymous function still has to be called something.
    const name = options.name ?? (component.name.length > 0 ? component.name : 'spawned');
    const byFunction = options.name === undefined && component.name.length > 0;

    /**
     * Why nothing can be made now, or `null` when something can. The place it would hang from may
     * be gone: destroyed, or in a scene that has stopped (a timer or a module's listener that
     * outlived it), or a game that has ended.
     */
    const goneFrom = (parent: TBox): 'destroyed' | 'stopped' | null => {
        if (store.get('loop').destroyed) {
            return 'stopped';
        }
        let top = parent;
        for (let at: TBox | null = parent; at !== null; at = at.parent) {
            if (at.destroyed) {
                return 'destroyed';
            }
            top = at;
        }
        return isSceneStopped(top) ? 'stopped' : null;
    };
    let warned = false;

    return (...args: TArgs) => {
        const parent = parentOf();
        const gone = goneFrom(parent);
        if (gone !== null) {
            // Nothing built, nothing run: a body building into a scene nobody draws would play its
            // sounds and start its timers for no one. Something already destroyed comes back, so the
            // caller's `destroy` or `.api` finds what it always finds. Under something destroyed it
            // says nothing, as that goes at the end of the frame anyway: a shot from an enemy killed
            // this frame. A scene gone is a mistake worth saying, once.
            if (gone === 'stopped' && !warned) {
                warned = true;
                let top = parent;
                while (top.parent !== null) top = top.parent;
                console.warn(
                    `[NacatamalOn] useSpawn: '${name}' was asked for after its scene '${top.name}' had stopped, ` +
                    'so nothing was made. Something kept calling the maker once the scene was gone: a ' +
                    'setTimeout or a listener of its own. useTimer and the hooks stop with the scene.',
                );
            }
            const dead = newBox(name) as TGameObject<TApi>;
            dead.destroyed = true;
            return dead;
        }
        let api: TApi | undefined;
        const box = spawnBox(store, parent, name, (...given: TArgs) => {
            const self = getActiveBox();
            // Before the body, so a body that names itself is seen doing it, and finds its tags.
            if (self !== null) {
                markMadeBy(self, component);
                if (byFunction) markNamedByFunction(self);
                if (options.tags !== undefined && options.tags.length > 0) self.tags = [...options.tags];
            }
            api = component(...given);
        }, args);
        // Set once the body is over rather than from inside it: until then there is nothing whole
        // to talk to, and a body that threw has never reached here.
        box.api = api;
        return box as TGameObject<TApi>;
    };
};
