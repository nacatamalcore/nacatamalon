import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';

/**
 * Who asked for each loaded thing, kept after they stopped: the scenes and systems of a game that
 * listed it in their `loads` and are gone now. What is still running is read from its own `loads`
 * when asked, so only a root that leaves writes here.
 *
 * Names and nothing else: a stopped scene must not stay in memory because it once asked for a
 * picture. Kept per game, since two games on a page are asked about apart, and by the thing, so it
 * goes with it.
 */
const askedBefore = new WeakMap<TRuntimeStore, WeakMap<object, Set<string>>>();

/** How many times a name was written down for each game: what tells a tool watching it. */
const written = new WeakMap<TRuntimeStore, number>();

/**
 * Writes down, for each thing `root` asked for, that `name` did: `root` is a scene or a system of
 * `store` about to stop, and its `loads` go with it. `name` is the one it was started under, which
 * for a scene made from a document is not always its root's.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const rememberAsked = (store: TRuntimeStore, root: TBox, name: string): void => {
    if (root.loads.length === 0) {
        return;
    }
    let byThing = askedBefore.get(store);
    if (byThing === undefined) {
        byThing = new WeakMap();
        askedBefore.set(store, byThing);
    }
    for (const thing of root.loads) {
        let names = byThing.get(thing);
        if (names === undefined) {
            names = new Set();
            byThing.set(thing, names);
        }
        if (!names.has(name)) {
            names.add(name);
            written.set(store, (written.get(store) ?? 0) + 1);
        }
    }
};

/**
 * How many names have been written down for `store` so far: one more each time a stopped scene or
 * system is said to have asked for something it was not said to before.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const askedBeforeCount = (store: TRuntimeStore): number => written.get(store) ?? 0;

/**
 * The names of the stopped scenes and systems of `store` that asked for `thing`, the first to stop
 * first.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const askedBeforeBy = (store: TRuntimeStore, thing: object): readonly string[] => [
    ...(askedBefore.get(store)?.get(thing) ?? []),
];
