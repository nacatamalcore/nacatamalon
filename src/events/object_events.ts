import type { TBox } from '../box';

/**
 * What a handler connected with `onEvent` is told: what came with the event, and the object that sent
 * it (the button itself, inside the copy a game placed).
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TObjectEventHandler<T = unknown> = (payload: T, from: TBox) => void;

/**
 * Who listens to what, per object. A map beside the objects, never a field in them, so an object
 * stays plain data and one nobody holds any more takes its handlers with it.
 */
const handlers = new WeakMap<TBox, Map<string, TObjectEventHandler[]>>();

/**
 * Connects `handler` to the event `name` on `object`. Internal twin of `onEvent`, which is the one a
 * game calls; `createPack` connects its `on` through here.
 *
 * @internal
 */
export const connectObjectEvent = <T>(object: TBox, name: string, handler: TObjectEventHandler<T>): (() => void) => {
    let byName = handlers.get(object);
    if (byName === undefined) {
        byName = new Map();
        handlers.set(object, byName);
    }
    const list = byName.get(name) ?? [];
    list.push(handler as TObjectEventHandler);
    byName.set(name, list);

    const off = (): void => {
        const current = handlers.get(object)?.get(name);
        if (current === undefined) return;
        const left = current.filter((existing) => existing !== handler);
        if (left.length === 0) handlers.get(object)!.delete(name);
        else handlers.get(object)!.set(name, left);
    };
    // Leaves with the object: a destroyed one, or one whose scene stopped, hears nothing more.
    object.cleanups.push(off);
    return off;
};

/**
 * Sends the event `name` from `from` up the tree, to the **first** object that listens to it (`from`
 * itself included), and stops there. Answers whether anybody heard it.
 *
 * Stopping at the first is what makes a copy a boundary: a game listens on what `createPack` gave back,
 * and an event sent from anywhere inside that copy reaches it, and goes no further. An object that is
 * destroyed, or whose scene is paused or held behind a transition, is skipped as if it were not there.
 *
 * @internal
 */
export const sendObjectEvent = (from: TBox, name: string, payload: unknown): boolean => {
    let object: TBox | null = from;
    while (object !== null) {
        const list = object.destroyed ? undefined : handlers.get(object)?.get(name);
        if (list !== undefined && list.length > 0) {
            // Over a copy: a handler that disconnects another during this event does not stop it here.
            for (const handler of [...list]) handler(payload, from);
            return true;
        }
        object = object.parent;
    }
    return false;
};
