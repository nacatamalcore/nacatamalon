import { getActiveBox } from '../../store';
import type { TGameObject } from '../spawn/use_spawn';

/**
 * Reaches the api of another behaviour on the same object: what its function returned, by the name
 * it was registered under.
 *
 * The same rule a component follows with `useSpawn`, whatever it returns is its api, for behaviours
 * put together through a saved scene: the two files do not know about each other and cannot import
 * anything, so one names the other. The same word goes in `requires`.
 *
 * **It gives back a way to ask, not the answer.** An object's behaviours run in one pass, in the
 * order they are listed, so one listed above the one it needs would find nothing yet. Asked at the
 * moment of use, everything on the object has run.
 *
 * It answers `null` while that behaviour is not on the object, or returned nothing: say `?.`.
 * Reaching across objects is what signals are for.
 *
 * @param name The other behaviour's name, as `registerScript` was given it.
 * @param self Another object to ask instead of the one being built. Rarely needed.
 * @returns A function that gives back its api, or `null`. Ask it when you need it, not once.
 *
 * @example
 * ```ts
 * registerScript('spin', (self) => {
 *     let running = true;
 *     useUpdate((delta) => { if (running) self.drawables[0].transform.rotation += delta; });
 *     return {
 *         stop: () => { running = false; },
 *         start: () => { running = true; },
 *         isRunning: () => running,
 *     };
 * });
 *
 * registerScript('toggle', () => {
 *     const spin = useScriptApi<{ stop(): void; start(): void; isRunning(): boolean }>('spin');
 *     const keys = useKeyboard();
 *
 *     useUpdate(() => {
 *         if (!keys.justPressed('Space')) return;
 *         const api = spin();
 *         if (api === null) return;
 *         if (api.isRunning()) api.stop(); else api.start();
 *     });
 * }, { requires: ['spin'] });
 * ```
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useScriptApi = <T>(name: string, self?: TGameObject): (() => T | null) => {
    // The object is caught now, the value is not: what has run on it keeps changing for the rest
    // of the pass.
    const box = self ?? getActiveBox();
    if (box === null || box === undefined) {
        throw new Error('[NacatamalOn] useScriptApi: call it inside a scene body, not from a timer or a callback.');
    }
    return () => (box.scriptApis.get(name) as T | undefined) ?? null;
};
