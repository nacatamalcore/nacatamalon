import type { TRuntimeStore } from '../store';
import { finishDestroy } from './finish_destroy';

/**
 * Empties the queue `destroy` filled, once per frame, at the only point where nobody is reading
 * the tree: after every update and before the frame is drawn. That is what keeps a destroyed
 * object from being drawn one last time.
 *
 * The queue is emptied **before** it is walked, so a cleanup that destroys something else (a
 * dying tank taking its turret) lands in a fresh queue for the next frame instead of growing the
 * array being iterated.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const flushDestroyed = (store: TRuntimeStore): void => {
    const world = store.get('world');
    if (world.pendingDestroy.length === 0) {
        return;
    }

    const queued = world.pendingDestroy.splice(0, world.pendingDestroy.length);

    for (const target of queued) {
        finishDestroy(store, target);
    }
};
