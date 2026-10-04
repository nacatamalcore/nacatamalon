import { withActiveBox } from '../store/active_box';
import { withActiveGame } from '../store/active_game';
import type { TRuntimeStore } from '../store';
import { trackBoxGame } from './box_game';
import { newBox } from './new_box';
import type { TBox } from './types/t_box';

/**
 * Builds one box from a component function: a fresh box under `parent`, the body run with that box
 * active so every hook in it lands there, and the box attached whether or not the body threw.
 *
 * This is the whole difference between a component and a plain helper function. Both are just
 * functions calling hooks; what gives one an identity of its own is being started through here.
 *
 * Attached **before** the body runs, unlike a scene, so the body can already reach its own place in
 * the tree (`useSelf`, and later a parent's transform). A body that throws leaves the box attached
 * and empty rather than half-built and orphaned, and the error reaches the caller.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const spawnBox = <TArgs extends unknown[]>(
    store: TRuntimeStore,
    parent: TBox,
    name: string,
    body: (...args: TArgs) => void,
    args: TArgs,
): TBox => {
    const box = newBox(name);
    box.parent = parent;
    trackBoxGame(box, store);

    // Read **before** the body below pushes its own: an empty stack means no body is running, so
    // this was made by something already alive rather than while its scene was being built. That
    // is the line between the level and the bullets, and writing a scene down depends on it.
    box.spawned = store.get('world').boxStack.length === 0;

    // Pushed while the parent's own callbacks may be running: the update walk reads a copy of
    // `children`, so a box born mid-frame joins the tree without disturbing the walk, and starts
    // updating on the next frame rather than half way through this one.
    parent.children.push(box);

    withActiveGame(store, () => withActiveBox(store, box, () => body(...args)));

    return box;
};
