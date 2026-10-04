import { STORE_FORMAT, STORE_VERSION } from './t_store_doc';
import type { TGameStore } from '../types/t_game_store';
import type { TStoreDoc, TStoreField, TStoreFieldType, TStoreFieldValue } from './t_store_doc';

/**
 * Whether every listed key is a finite number on this object, which is what the places are.
 */
const numbersOn = (value: Record<string, unknown>, keys: string[]): boolean =>
    keys.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]));

/**
 * The row type a live value would be written as, or `null` for one no row can hold.
 */
const typeOf = (value: unknown): TStoreFieldType | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return 'number';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

    const record = value as Record<string, unknown>;
    // Colour before place, because a colour has four named parts and neither place has an `r`.
    if (numbersOn(record, ['r', 'g', 'b', 'a'])) return 'color';
    if (numbersOn(record, ['x', 'y', 'z'])) return 'vec3';
    if (numbersOn(record, ['x', 'y'])) return 'vec2';
    return null;
};

const valueOf = (type: TStoreFieldType, value: unknown): TStoreFieldValue => {
    const record = value as Record<string, number>;
    switch (type) {
        case 'number': return value as number;
        case 'string': return value as string;
        case 'boolean': return value as boolean;
        case 'vec2': return { x: record.x, y: record.y };
        case 'vec3': return { x: record.x, y: record.y, z: record.z };
        case 'color': return { r: record.r, g: record.g, b: record.b, a: record.a };
        default: {
            const never: never = type;
            return never;
        }
    }
};

/**
 * The rows that describe a state object, as a file would hold them.
 *
 * The types are worked out from the values, which is the only thing available: the state is plain
 * JSON and JSON does not say what it meant. A pair of finite numbers called `x` and `y` is a place,
 * four called `r`, `g`, `b` and `a` are a colour, and the ambiguity is deliberate: those are the
 * shapes this engine uses everywhere, and reading them as themselves is right far more often than
 * it is wrong.
 *
 * **What no row can hold is left out, and said out loud.** A list and a nested object are the two
 * that come up, and neither can be typed into a form, so a store with an inventory in it can be
 * written down only as far as the rest of it. That is a real limit of describing state as a table,
 * not an oversight: the answer for a list is code, which is the half of a store that is still code.
 * @param state - A store's state.
 * @returns One row per field the rows can hold.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const storeFieldsFromState = (state: Record<string, unknown>): TStoreField[] => {
    const fields: TStoreField[] = [];
    const dropped: string[] = [];
    for (const [name, value] of Object.entries(state)) {
        const type = typeOf(value);
        if (type === null) {
            dropped.push(name);
            continue;
        }
        fields.push({ name, type, value: valueOf(type, value) });
    }
    if (dropped.length > 0) {
        console.warn(`[NacatamalOn] a store's ${dropped.length} field(s) cannot be written as rows (${dropped.join(', ')}), so they are left out. Lists and nested objects have no row type; the code that declares them keeps them.`);
    }
    return fields;
};

/**
 * A live store, back into the file it would be written as.
 *
 * What it writes is the state **as it is now**, not as the code declared it, which is what a tool
 * saving an edited value needs. Anything the rows cannot hold is left behind; see
 * {@link storeFieldsFromState}.
 *
 * How the store saves itself is not written: that is behaviour, it lives in the code that declares
 * the store, and a file claiming it would be a second answer to a question the code has already
 * answered.
 * @param store - The store to write.
 * @returns The file.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const serializeStoreDoc = (store: TGameStore<Record<string, unknown>, unknown>): TStoreDoc => ({
    format: STORE_FORMAT,
    version: STORE_VERSION,
    key: store.key,
    fields: storeFieldsFromState(store.state),
});

/**
 * The file a brand new store starts as: its name, and nothing in it yet.
 * @param key - The new store's name.
 * @returns The file, with no fields yet.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const emptyStoreDoc = (key: string): TStoreDoc => ({
    format: STORE_FORMAT,
    version: STORE_VERSION,
    key,
    fields: [],
});
