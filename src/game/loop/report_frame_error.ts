import type { TRuntimeStore } from '../../store';

/**
 * Keeps the error a scene's update threw, if it is the first, and says so once.
 *
 * The rest go unsaid on purpose: a broken script throws the same thing on every frame, and the one
 * line that explains it is worth more than sixty a second that bury it. The game hears about it
 * through `game.on('error')`, which is watching this same field.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const reportFrameError = (store: TRuntimeStore, error: unknown): void => {
    if (store.get('loop').failure !== null) {
        return;
    }
    const failure = error instanceof Error ? error : new Error(String(error));
    console.error('[NacatamalOn] a scene update threw. The scene skips the rest of its update on every frame this keeps happening; everything else goes on.', failure);
    store.setState('loop', { failure });
};
