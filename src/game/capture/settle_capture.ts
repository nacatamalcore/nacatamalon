import type { TRuntimeStore } from '../../store';

/**
 * Ends the capture waiting on this frame, if there is one: drawn when no error is given, failed with
 * it when one is.
 *
 * Called on every way out of a frame that tried to draw, and when the game is destroyed, because a
 * capture nobody settles is a promise that never resolves: whoever asked would wait for ever instead
 * of hearing about the crash the console already showed.
 *
 * @internal
 */
export const settleCapture = (store: TRuntimeStore, error?: unknown): void => {
    const { request } = store.get('capture');
    if (request === null) {
        return;
    }
    store.setState('capture', { request: null });
    request.settle(error);
};
