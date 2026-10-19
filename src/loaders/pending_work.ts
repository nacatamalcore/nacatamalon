import { rootOf } from '../box/root_of';
import { getActiveBox } from '../store/active_box';
import type { TBox } from '../box/types/t_box';

/**
 * Work a scene started without waiting for it, which is not a file it loads: a physics world whose
 * engine is still being compiled. A page does not wait for it either, since the frames go on and it
 * lands between two of them; a host that moves the game itself, with no frames of its own between
 * (`createHeadlessGame`), has to know there is something still on its way before it runs any.
 *
 * Kept beside the scene rather than on it, so the box stays plain data, and weak so a scene that is
 * gone takes its work with it.
 */
const pending = new WeakMap<TBox, Set<Promise<unknown>>>();

/**
 * Says that the scene being built has `work` on its way. Nothing waits for it here; it is only
 * remembered until it settles. Outside a scene's body it is not remembered at all.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const trackPendingWork = (work: Promise<unknown>): void => {
    const active = getActiveBox();
    if (active === null) {
        return;
    }
    const scene = rootOf(active);
    let set = pending.get(scene);
    if (set === undefined) {
        set = new Set();
        pending.set(scene, set);
    }
    const tracked = set;
    tracked.add(work);
    const done = (): void => { tracked.delete(work); };
    work.then(done, done);
};

/**
 * What a scene still has on its way, of the work it started without waiting for.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const pendingWorkOf = (scene: TBox): Promise<unknown>[] => [...(pending.get(scene) ?? [])];
