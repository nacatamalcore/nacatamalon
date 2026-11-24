import { getActiveBox } from '../store/active_box';
import type { TBox } from '../box';

/**
 * What a handler connected with `onReport` is told: what came with the report, and the object that
 * sent it (the button itself, inside the copy a game placed).
 *
 * @category Signals
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TReportHandler<T = unknown> = (payload: T, from: TBox) => void;

/**
 * Who listens to what, per object. A map beside the objects, never a field in them, so an object
 * stays plain data and one nobody holds any more takes its handlers with it.
 */
const handlers = new WeakMap<TBox, Map<string, TReportHandler[]>>();

/**
 * Whoever was being built when each connection was made, for the ones made inside a body.
 */
const listeners = new WeakMap<TReportHandler, TBox>();

/**
 * Whether a connection still hears: not once whoever made it has been destroyed.
 */
const hears = (connection: TReportHandler): boolean => listeners.get(connection)?.destroyed !== true;

/**
 * Connects `handler` to the report `name` on `object`. Internal twin of `onReport`, which is the one a
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
export const connectReport = <T>(object: TBox, name: string, handler: TReportHandler<T>): (() => void) => {
    let byName = handlers.get(object);
    if (byName === undefined) {
        byName = new Map();
        handlers.set(object, byName);
    }
    const listener = getActiveBox();
    // Its own function, not `handler`: what tells this connection from another of the same handler.
    const connection: TReportHandler = (payload, from) => (handler as TReportHandler)(payload, from);
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
 * What a watcher is told of each report that passes through what it watches: its name, what came
 * with it and the object that sent it.
 *
 * @internal
 */
export type TReportWatcher = (name: string, payload: unknown, from: TBox) => void;

/**
 * Who watches what, per object.
 */
const watchers = new WeakMap<TBox, TReportWatcher[]>();

/**
 * Hears every report sent from `scope` or from anything inside it, made now or later, **without
 * taking it**: the report still climbs to the first object that listens, which hears it first.
 *
 * What a game's rules need, which watch a whole scene for "a coin was picked" while a pack's copy
 * still hears its own button. Listening (`connectReport`) would stop the report at the rule, and
 * whoever placed the piece would never hear it.
 *
 * Lasts as long as `scope` does, and, connected while something is being built, as long as that
 * does too. The function it returns stops it earlier.
 *
 * @internal
 */
export const watchReports = (scope: TBox, watcher: TReportWatcher): (() => void) => {
    const list = watchers.get(scope) ?? [];
    // Its own function, so the same watcher connected twice is let go one at a time.
    const connection: TReportWatcher = (name, payload, from) => watcher(name, payload, from);
    list.push(connection);
    watchers.set(scope, list);
    let connected = true;
    const builder = getActiveBox();
    const off = (): void => {
        if (!connected) return;
        connected = false;
        const current = watchers.get(scope);
        if (current !== undefined) {
            const left = current.filter((existing) => existing !== connection);
            if (left.length === 0) watchers.delete(scope);
            else watchers.set(scope, left);
        }
        // Out of the other end's cleanups too: a scene where boxes with rules come and go all game
        // long would otherwise keep one for each until it ends.
        for (const end of [scope, builder]) {
            const at = end?.cleanups.indexOf(off) ?? -1;
            if (end && at >= 0) end.cleanups.splice(at, 1);
        }
    };
    scope.cleanups.push(off);
    if (builder !== null && builder !== scope) builder.cleanups.push(off);
    return off;
};

/**
 * Tells the watchers of `from` and of everything above it, whoever listens.
 */
const tellWatchers = (from: TBox, name: string, payload: unknown): void => {
    for (let object: TBox | null = from; object !== null; object = object.parent) {
        if (object.destroyed) continue;
        const list = watchers.get(object);
        if (list === undefined) continue;
        for (const watcher of [...list]) {
            try {
                watcher(name, payload, from);
            } catch (error) {
                // A watcher that broke must not keep the report from the others, nor from its listener.
                console.error(`[NacatamalOn] the report '${name}' from '${from.name}': something watching it threw, and the others still heard it. Look at the rule or tool that watches it.`, error);
            }
        }
    }
};

/**
 * Sends the report `name` from `from` up the tree, to the **first** object that listens to it (`from`
 * itself included), and stops there. Answers whether anybody heard it. What watches (`watchReports`)
 * anywhere on the way hears it after that one, and does not stop it.
 *
 * Stopping at the first is what makes a copy a boundary: a game listens on what `createPack` gave back,
 * and a report sent from anywhere inside that copy reaches it, and goes no further. An object that is
 * destroyed is skipped as if it were not there, and so is a connection whose listener was destroyed.
 *
 * A paused scene still hears, as it does a signal: nothing inside it sends while it is paused (its
 * updates and timers stand still, and the pointer passes it by), so what reaches it was sent on
 * purpose from elsewhere, and dropping it would lose it without a word.
 *
 * @internal
 */
export const sendReport = (from: TBox, name: string, payload: unknown): boolean => {
    const heard = climb(from, name, payload);
    // After whoever listens, so what a watcher does (a rule destroying the one that told) never keeps
    // the report from them.
    tellWatchers(from, name, payload);
    return heard;
};

/** Sends it up to the first object that listens, and says whether one did. */
const climb = (from: TBox, name: string, payload: unknown): boolean => {
    let object: TBox | null = from;
    while (object !== null) {
        // Only the connections that still hear: one whose listener was destroyed this frame is not a
        // listener, and must not keep the report from the object above.
        const list = object.destroyed ? undefined : handlers.get(object)?.get(name)?.filter(hears);
        if (list !== undefined && list.length > 0) {
            // A copy already: a handler that disconnects another during this report does not stop it here.
            for (const handler of list) {
                if (hears(handler)) handler(payload, from);
            }
            return true;
        }
        object = object.parent;
    }
    return false;
};
