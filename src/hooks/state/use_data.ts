import { getActiveBox, bumpVersion, markWatchable } from '../../store';
import type { TBox } from '../../box/types/t_box';
import { outsideSceneBody } from '../../utils/outside_scene_body';

/**
 * Who asks for a box's state while a behaviour runs on it: that box and that behaviour's
 * attachment id. Outside a behaviour, or on another box (a piece the behaviour spawns), it is the
 * box's own body, written as no owner at all.
 */
let running: { box: TBox; id: string } | null = null;

/**
 * Who owns each piece of state, by its record. Absent is the box's own body.
 */
const owners = new WeakMap<object, string>();

/**
 * What a box was saved holding, by owner (`''` for the body), waiting for the calls that will ask
 * for it again.
 *
 * A side table and not a field of the box: it only exists while a box is being rebuilt from a
 * document, and nothing else ever reads it.
 */
const saved = new WeakMap<TBox, Map<string, unknown[]>>();

const ownerFor = (box: TBox): string => (running !== null && running.box === box ? running.id : '');

/**
 * Runs a behaviour with its state its own: what it asks for with `useData` (and `useStateMachine`)
 * on its box is written down as its, and what it was saved with comes back to it and to no other.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const withDataOwner = <T>(box: TBox, id: string, fn: () => T): T => {
    const before = running;
    running = { box, id };
    try {
        return fn();
    } finally {
        running = before;
    }
};

/**
 * Puts a piece of state on a box, as its owner's: the box's body, or the behaviour running on it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const addDataRecord = (box: TBox, record: TDataRecord<unknown>): void => {
    const owner = ownerFor(box);
    if (owner !== '') {
        owners.set(record, owner);
    }
    box.data.push(record);
};

/**
 * Which behaviour (its attachment id) a piece of state belongs to, or `undefined` for the box's
 * own body. What a saved scene writes as `by`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const dataOwnerOf = (record: object): string | undefined => owners.get(record);

/**
 * Hands a box the state it was saved with, before anything on it runs.
 *
 * Each owner gets its own values back, in order: the box's body the entries with no `by`, and each
 * behaviour the ones with its id. That is how a behaviour gets back what it had, rather than
 * starting over next to a copy of its old state, and why one that is gone does not hand its state
 * to the next. Whatever nobody asks for is kept by `keepUnclaimedData`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const offerSavedData = (box: TBox, entries: ReadonlyArray<{ value: unknown; by?: string }>): void => {
    if (entries.length === 0) {
        return;
    }
    const byOwner = saved.get(box) ?? new Map<string, unknown[]>();
    for (const entry of entries) {
        const owner = entry.by ?? '';
        const list = byOwner.get(owner) ?? [];
        list.push(entry.value);
        byOwner.set(owner, list);
    }
    saved.set(box, byOwner);
};

/**
 * The next value the one asking was saved with, for a hook that keeps its state in `box.data`
 * (`useData`, `useStateMachine`). `null` when there is none waiting.
 *
 * A copy, never the document's own object: the game changes its state in place, and the document
 * has to stay what was saved, for the next time the scene is started from it and for a copy of
 * the box.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const takeSavedData = (box: TBox): { value: unknown } | null => {
    const waiting = saved.get(box)?.get(ownerFor(box));
    if (waiting === undefined || waiting.length === 0) {
        return null;
    }
    return { value: structuredClone(waiting.shift()) };
};

/**
 * Keeps, as state of their own and still their owner's, the saved values nobody asked for once the
 * box is built.
 *
 * A behaviour that did not run (a scene shown rather than played) or that is not registered any
 * more still has its state in the file, and saving again must not quietly drop it.
 *
 * Called with that box active.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const keepUnclaimedData = (box: TBox): void => {
    const left = saved.get(box);
    saved.delete(box);
    for (const [owner, values] of left ?? []) {
        for (const value of values) {
            const keep = (): void => { useData(structuredClone(value)); };
            if (owner === '') {
                keep();
            } else {
                withDataOwner(box, owner, keep);
            }
        }
    }
};

/**
 * State that belongs to one piece of the scene, handed back as an object you read `.value` from.
 *
 * An object and not the value itself, because the body of a scene runs **once**: a plain value read
 * there would be the value it had at that moment, for ever, no matter what happened afterwards.
 * The object never changes identity, so reading `.value` later, inside `useUpdate` or a click,
 * always gives what it holds now.
 *
 * @category State
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDataRecord<T> = {
    value: T;
};

/**
 * How that state is changed. Three forms, and they are interchangeable:
 *
 * - the next value: `setLives(2)`;
 * - a function that **returns** the next value: `setLives((n) => n - 1)`;
 * - a function that **changes it in place** and returns nothing: `setHero((h) => { h.x += 1; })`.
 *
 * The third is why the function may return nothing: when it does, what it was given is taken as
 * already changed. That is the same shape a store's `set` has, so one habit covers both, while the
 * returning form stays there for numbers and strings, where changing in place is not possible.
 *
 * Whichever form is used, the change is announced, which is what `useWatch` is listening for.
 *
 * @category State
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDataSetter<T> = (next: T | ((previous: T) => T | void)) => void;

/**
 * State that lives with a piece of the scene, as `[data, setData]`.
 *
 * Read it as `data.value`, change it with the setter, and have something react to it with
 * `useWatch(fn, [data])`. Two things far apart can share one: whoever makes it can hand it to
 * whatever it builds, and each of them watches it without knowing about the others.
 *
 * **Change it through the setter, not with `data.value = x`.** Writing to the field works and is
 * read back correctly, but nothing is told about it, so a `useWatch` on it will not run.
 *
 * It is also what gets saved. A scene written down carries this state and gives it back when the
 * scene is opened again, which is what makes a saved game a saved game and not a fresh start. Keep
 * in it the kind of thing a file can hold: numbers, text, lists and plain objects. A texture or a
 * function is not something a file can keep.
 *
 * Call it in the scene body, like the rest of the hooks.
 *
 * @param initial What it holds before anything changes it.
 *
 * @example
 * ```ts
 * declare const counter: TText;
 *
 * export const Level: TSceneFn = () => {
 *     const [lives, setLives] = useData(3);
 *
 *     useWatch(() => {
 *         counter.text = `LIVES ${lives.value}`;
 *     }, [lives]);
 *
 *     usePointer().onDown(() => setLives((n) => n - 1));
 *
 *     return createScene();
 * };
 * ```
 *
 * @returns `[data, setData]`: read the value as `data.value`, and change it with `setData`, which
 *   tells whatever watches it.
 *
 * @category State
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useData = <T>(initial: T): [TDataRecord<T>, TDataSetter<T>] => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useData');
    }

    // Rebuilt from a document: the value it was saved with comes back in place of the first one.
    const restored = takeSavedData(box);
    const record: TDataRecord<T> = { value: restored !== null ? restored.value as T : initial };
    // Signed up before anything can watch it, so a watch set up in the same body is accepted even
    // though nothing has changed yet.
    markWatchable(record);
    addDataRecord(box, record as TDataRecord<unknown>);

    const setData: TDataSetter<T> = (next) => {
        if (typeof next === 'function') {
            // Gave back a value: that is the new one. Gave back nothing: it changed what it was
            // handed, and there is nothing to replace.
            const result = (next as (previous: T) => T | void)(record.value);
            if (result !== undefined) {
                record.value = result;
            }
        } else {
            record.value = next;
        }
        bumpVersion(record);
    };

    return [record, setData];
};
