/**
 * How the engine says "this changed", for the handful of things it changes itself.
 *
 * The counters live in a `WeakMap` **outside** the records rather than as a field on them, and that
 * is not a detail: a record here is plain JSON that a scene file is written from, so a bookkeeping
 * field would have to be stripped on the way out and would come back on the way in. Kept outside,
 * a record stays exactly what it looks like.
 *
 * The map is also the register of what can be watched at all. An object it has never heard of is
 * not "unchanged", it is **not something this engine reports on**, and telling those two apart is
 * the whole reason `markWatchable` exists as a separate step from bumping.
 */
const versions = new WeakMap<object, number>();

/**
 * Signs `record` up, at zero, so the engine will report on it from now on, and hands it straight
 * back.
 *
 * Called when the record is made, not when it first changes. Something watched before its first
 * change is the ordinary case, and without this it would be indistinguishable from a stray object
 * that nothing ever updates.
 *
 * It returns what it was given so a factory that is one expression stays one expression:
 * `markWatchable({ ... })` rather than a body with a variable and a return.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const markWatchable = <T extends object>(record: T): T => {
    if (!versions.has(record)) {
        versions.set(record, 0);
    }
    return record;
};

/**
 * Marks `record` as changed, and signs it up if it was not already.
 *
 * Every engine write that a watcher should hear about goes through here: the setter from `useData`,
 * a loader reaching `ready` or `error`. A field written straight onto the record goes around it and
 * is not reported, which is the same rule React has about not assigning to state.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const bumpVersion = (record: object): void => {
    versions.set(record, (versions.get(record) ?? 0) + 1);
};

/**
 * How many times `record` has been reported changed. Zero for one that never has.
 *
 * Read once per frame per dep by `useWatch`, which is a **pull**: nothing is dispatched when
 * nothing happened, so a game with no watchers pays nothing for any of this.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const getVersion = (record: object): number => versions.get(record) ?? 0;

/**
 * Whether the engine reports changes on `record` at all.
 *
 * What `useWatch` asks before accepting a dep. Watching something nobody reports on is not a
 * quieter version of watching: it is a callback that runs once and never again, with no error and
 * nothing in the console, which is the worst way for this to go wrong.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isWatchable = (record: object): boolean => versions.has(record);
