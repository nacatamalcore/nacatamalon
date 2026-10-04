import { gameOfBox, ownerOfDrawable } from '../box';
import type { TBox } from '../box';
import { isRunningUpdates } from '../store';
import type { TRuntimeStore } from '../store';
import type { TDrawable } from '../gameobjects/types';
import { finishDestroy } from './finish_destroy';
import { isGameObject } from './is_game_object';
import type { TGameObject } from '../hooks';

/**
 * How `destroy` should go about it.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDestroyOptions = {
    /**
     * Ask for it to be gone the instant you say so, instead of at the end of the frame. It is a
     * request and not an order: asked for while the game is running its updates, it is queued
     * anyway, so the call is never the wrong one to write.
     */
    immediate?: boolean;
};

/**
 * The game a target belongs to, whichever kind it is. Both keep it outside themselves, because
 * `destroy` is called from gameplay code and the active-game pointer is only set while a scene
 * is being built.
 */
const storeOf = (target: TDrawable | TBox): TRuntimeStore | undefined =>
    isGameObject(target) ? gameOfBox(target) : ownerOfDrawable(target)?.store;

/**
 * Removes something from the game for good: a sprite, or a whole thing made by a spawner, with
 * its sprites, its per-frame code and its cleanups. It stops being drawn **in this same frame**,
 * whether it goes at once or at the end of it, and a spawned object stops running the moment you
 * say so.
 *
 * Destroying twice, or destroying something that was never on screen, does nothing and says
 * nothing: you should not have to find out whether someone else got there first. What is
 * destroyed is gone, not recycled, so keep making new ones rather than reviving old ones.
 *
 * Images are **not** freed. Several things can be showing the same one, and the game keeps it for
 * whoever asks next, so destroying a sprite never costs the next one a reload.
 *
 * @param target The sprite or spawned object to remove. A scene is not one of these: it leaves
 * through `useScene().stop()`, and passing one here warns and does nothing.
 * @param options See `TDestroyOptions`. Leave it out for the usual behaviour.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const bullet = createSprite({ key: 'bullet', transform: { x: 160, y: 200 } });
 *
 *     useUpdate((delta) => {
 *         bullet.transform.y -= 300 * delta;
 *         if (bullet.transform.y < 0) {
 *             destroy(bullet);
 *         }
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const destroy = (target: TDrawable | TGameObject, options?: TDestroyOptions): void => {
    if (target.destroyed) {
        return;
    }

    const store = storeOf(target);
    if (store === undefined) {
        return;
    }

    // A scene is not something a game destroys: it is replaced or stopped through `useScene`,
    // which also has to take it off the game's list and start whatever comes next. Marking it
    // here would empty it while the loop went on running the husk.
    if (isGameObject(target) && store.get('world').scenes.includes(target)) {
        console.warn(`[NacatamalOn] destroy: '${target.name}' is a scene. Use useScene().stop() to leave it.`);
        return;
    }

    // Marked before anything else, so for the rest of this frame nothing treats it as alive, even
    // in the gap between asking and the sweep: a spawned object stops updating at once.
    target.destroyed = true;

    // Taking it out in the middle of the update pass would change the very tree being walked, so
    // the request is honoured only when nobody is reading. The caller cannot tell the difference:
    // the sweep lands before anything is drawn either way.
    if (options?.immediate === true && !isRunningUpdates(store)) {
        finishDestroy(store, target);
        return;
    }

    store.get('world').pendingDestroy.push(target);
};
