import { getActiveBox, bumpVersion, markWatchable } from '../../store';

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
        throw new Error('[NacatamalOn] useData: call it inside a scene body, not from a timer or a callback.');
    }

    const record: TDataRecord<T> = { value: initial };
    // Signed up before anything can watch it, so a watch set up in the same body is accepted even
    // though nothing has changed yet.
    markWatchable(record);
    box.data.push(record as TDataRecord<unknown>);

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
