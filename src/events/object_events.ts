import { getActiveBox } from '../store/active_box';
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
 * Whoever was being built when each connection was made, for the ones made inside a body.
 */
const listeners = new WeakMap<TObjectEventHandler, TBox>();

/**
 * Whether a connection still hears: not once whoever made it has been destroyed.
 */
const hears = (connection: TObjectEventHandler): boolean => listeners.get(connection)?.destroyed !== true;

/**
 * Connects `handler` to the event `name` on `object`. Internal twin of `onEvent`, which is the one a
 * game calls; `createPack` connects its `on` through here.
 *
 * **It lasts as long as both ends do**: the object listened on, and whoever was being built when it
 * was connected. A HUD listening on its scene goes deaf when the HUD is destroyed, though the scene
 * lives on, rather than writing on a text that is gone, and hearing twice once a new HUD takes its
 * place. Deaf from the moment it is destroyed, not only once the frame ends and takes it out.
 * Connected from outside any body (a callback, a timer), only the object listened on decides.
 *
 * Each call is a connection of its own: the same handler connected twice is two, and the function
 * one call gives back lets go of that one only.
 *
 * @internal
 */
export const connectObjectEvent = <T>(object: TBox, name: string, handler: TObjectEventHandler<T>): (() => void) => {
    let byName = handlers.get(object);
    if (byName === undefined) {
        byName = new Map();
        handlers.set(object, byName);
    }
    const listener = getActiveBox();
    // Its own function, not `handler`: what tells this connection from another of the same handler.
    const connection: TObjectEventHandler = (payload, from) => (handler as TObjectEventHandler)(payload, from);
    if (listener !== null) {
        listeners.set(connection, listener);
    }
    const list = byName.get(name) ?? [];
    list.push(connection);
    byName.set(name, list);

    let connected = true;
    const off = (): void => {
        if (!connected) return;
        connected = false;
        const current = handlers.get(object)?.get(name);
        if (current === undefined) return;
        const left = current.filter((existing) => existing !== connection);
        if (left.length === 0) handlers.get(object)!.delete(name);
        else handlers.get(object)!.set(name, left);
    };
    // Leaves with the object: a destroyed one, or one whose scene stopped, hears nothing more.
    object.cleanups.push(off);
    // And with whoever listened, when that is something else.
    if (listener !== null && listener !== object) {
        listener.cleanups.push(off);
    }
    return off;
};

/**
 * Sends the event `name` from `from` up the tree, to the **first** object that listens to it (`from`
 * itself included), and stops there. Answers whether anybody heard it.
 *
 * Stopping at the first is what makes a copy a boundary: a game listens on what `createPack` gave back,
 * and an event sent from anywhere inside that copy reaches it, and goes no further. An object that is
 * destroyed is skipped as if it were not there, and so is a connection whose listener was destroyed.
 *
 * A paused scene still hears, as it does a signal: nothing inside it sends while it is paused (its
 * updates and timers stand still, and the pointer passes it by), so what reaches it was sent on
 * purpose from elsewhere, and dropping it would lose it without a word.
 *
 * @internal
 */
export const sendObjectEvent = (from: TBox, name: string, payload: unknown): boolean => {
    let object: TBox | null = from;
    while (object !== null) {
        // Only the connections that still hear: one whose listener was destroyed this frame is not a
        // listener, and must not keep the event from the object above.
        const list = object.destroyed ? undefined : handlers.get(object)?.get(name)?.filter(hears);
        if (list !== undefined && list.length > 0) {
            // A copy already: a handler that disconnects another during this event does not stop it here.
            for (const handler of list) {
                if (hears(handler)) handler(payload, from);
            }
            return true;
        }
        object = object.parent;
    }
    return false;
};
