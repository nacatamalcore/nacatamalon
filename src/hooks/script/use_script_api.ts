import { getActiveBox } from '../../store';
import type { TGameObject } from '../spawn/use_spawn';

/**
 * Offers something to the other behaviours on the same object under `key`, besides what this one
 * returns under its own name: one word that several behaviours answer to (every one that can be hurt
 * offers `'health'`), or a second thing from one behaviour.
 *
 * @param key The word the others ask for it by, with `useScriptApi(key)`.
 * @param value Anything: usually a small set of functions the others may call.
 *
 * @example
 * ```ts
 * registerScript('slime', () => {
 *     let life = 3;
 *     provide('health', { hurt: (n: number) => { life -= n; } });
 * });
 *
 * registerScript('spikes', () => {
 *     // Whatever on this object can be hurt, slime or boss.
 *     const health = useScriptApi<{ hurt(n: number): void }>('health');
 *     useUpdate(() => health()?.hurt(1));
 * });
 * ```
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const provide = <T>(key: string, value: T): void => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] provide: call it inside a scene body, not from a timer or a callback.');
    }
    box.scriptApis.set(key, value);
};

/**
 * Reaches the api of another behaviour on the same object: what its function returned, by the name
 * it was registered under, or what one offered with `provide` under a word of its own.
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
 * @param name The other behaviour's name, as `registerScript` was given it, or the word it offered
 *   something under with `provide`.
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
