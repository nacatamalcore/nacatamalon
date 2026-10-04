import { getActiveBox } from '../../store';
import type { TGameObject } from '../spawn/use_spawn';

/**
 * Publishes something for the other behaviours on the same object to use, under `key`.
 *
 * For behaviours put together through a saved scene, where the two files do not know about each
 * other and cannot import anything. Scene code written by hand should just import.
 *
 * The convention that makes this readable: **the key is the name of whoever publishes it**, so
 * `provide('spin', ...)` is reached as `useApi('spin')` and named as `requires: ['spin']`. One
 * word, three places.
 *
 * @param key What to call it. The publisher's own name, by convention.
 * @param value Anything: usually a small set of functions the others may call.
 *
 * @example
 * ```ts
 * registerScript('spin', (self) => {
 *     let running = true;
 *     provide('spin', {
 *         stop: () => { running = false; },
 *         start: () => { running = true; },
 *         isRunning: () => running,
 *     });
 *     useUpdate((delta) => { if (running) self.drawables[0].transform.rotation += delta; });
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
    box.provided.set(key, value);
};

/**
 * Reaches what another behaviour on the same object published under `key`.
 *
 * **It gives back a way to ask, not the answer, and that is the whole design.** An object's
 * behaviours all run in one pass, in the order they are listed, so a behaviour listed above the one
 * it needs would find nothing and keep that nothing for ever: a bug that depends on the order of
 * two lines in a file nobody has open. Asking at the moment of use removes the question entirely,
 * because by the time anything is running, everything on the object has published.
 *
 * It answers `null` when nobody published that key, and callers are meant to say `?.` rather than
 * assume: an object may legitimately carry a consumer without its provider while it is being built.
 * To have that reported instead of merely survived, say so when registering:
 * `{ requires: ['spin'] }` is the half of this relationship somebody else can read.
 *
 * Reaching across objects is not what this is for. That is what signals are.
 *
 * @param key What the publisher called it.
 * @param self Another object to ask instead of the one being built. Rarely needed.
 *
 * @example
 * ```ts
 * registerScript('toggle', () => {
 *     const spin = useApi<{ stop(): void; start(): void; isRunning(): boolean }>('spin');
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
 * @returns A function that gives back what was published, or `null` while nothing has been. Ask it
 *   when you need the value, not once.
 *
 * @category Scripts
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useApi = <T>(key: string, self?: TGameObject): (() => T | null) => {
    // The object is caught now, the value is not. Which object a behaviour belongs to never
    // changes; what has been published on it keeps changing for the rest of the pass.
    const box = self ?? getActiveBox();
    if (box === null || box === undefined) {
        throw new Error('[NacatamalOn] useApi: call it inside a scene body, not from a timer or a callback.');
    }
    return () => (box.provided.get(key) as T | undefined) ?? null;
};
