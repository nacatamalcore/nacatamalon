import { getActiveBox } from '../../store';

/**
 * Runs when its owner goes away: the component it is called in when it is destroyed, or the scene
 * when it stops. Not on pause.
 *
 * For what you started outside the engine: a window listener, a `setInterval`, a request. What the
 * engine made goes away by itself. `destroy` is what sets it off.
 *
 * @param cleanup What to undo. It receives nothing and is called exactly once.
 *
 * @example
 * ```ts
 * const PauseMenu = () => {
 *     const onKey = (event: KeyboardEvent) => console.log(event.key);
 *     window.addEventListener('keydown', onKey);
 *
 *     // Without this, the listener stays alive after the menu is gone and fires behind it.
 *     useCleanup(() => window.removeEventListener('keydown', onKey));
 * };
 * ```
 *
 * @category Lifecycle
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCleanup = (cleanup: () => void): void => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useCleanup: call it inside a scene body or a component made with useSpawn, not from a timer or a callback.');
    }
    box.cleanups.push(cleanup);
};
