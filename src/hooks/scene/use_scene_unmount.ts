import { getActiveBox } from '../../store';

/**
 * Runs your code once, the moment the scene disappears: when it is stopped, when it changes to
 * another scene, or when the whole game is destroyed. Pausing is not leaving, so a paused scene
 * does not run it.
 *
 * You need it for what the scene started **outside** the engine, because that keeps running on
 * its own after the scene is gone: a `setInterval`, a `keydown` listener on the window, a request
 * you want to abort. Everything the engine gave you (its sprites, its `useUpdate`, its loaded
 * images) goes away with the scene and needs no cleaning.
 *
 * Register as many as you like; if one of them throws, it is reported and the rest still run.
 *
 * @param cleanup What to undo. It receives nothing and is called exactly once.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     const onKey = (event: KeyboardEvent) => console.log(event.key);
 *     window.addEventListener('keydown', onKey);
 *
 *     // Without this, the listener stays alive after the level ends and fires in the next scene.
 *     useSceneUnmount(() => window.removeEventListener('keydown', onKey));
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Lifecycle
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useSceneUnmount = (cleanup: () => void): void => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useSceneUnmount: call it inside a scene body.');
    }
    box.cleanups.push(cleanup);
};
