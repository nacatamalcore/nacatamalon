import { getActiveBox } from '../../store';
import type { TGameSignal, TSignalHandler } from '../../signal';

/**
 * Listens to a signal from a scene, and stops listening by itself when that part of the scene goes
 * away. Nothing to disconnect by hand.
 *
 * Call it in the scene body, or in the body of something created with `useSpawn`: then it stops when
 * that object is destroyed. It keeps listening while the scene is paused, because a signal is the
 * game telling itself something, and a paused level may still need to hear it.
 *
 * @param signal The signal, made with `createGameSignal`.
 * @param handler What to do each time it fires. Receives what the signal carries.
 *
 * @example
 * ```ts
 * declare const coinCollected: TGameSignal<number>;
 *
 * export const Hud: TSceneFn = () => {
 *     let score = 0;
 *     useSignal(coinCollected, (points) => { score += points; });
 *     return createScene();
 * };
 * ```
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSignal = <T>(signal: TGameSignal<T>, handler: TSignalHandler<T>): void => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useSignal: call it inside a scene body, not from a timer or a callback. In a React component, import useSignal from \'nacatamalon/react\' instead.');
    }

    const off = signal.connect((payload) => {
        // Destroyed this frame and not swept yet: it stops hearing now, the same way it stops updating.
        if (box.destroyed) {
            return;
        }
        handler(payload);
    });
    box.cleanups.push(off);
};
