import { asArray, asBoolean, asColor, asNumber, asOneOf, asRecord, asString } from '../../utils';
import { STORE_FORMAT, STORE_VERSION } from './t_store_doc';
import type { TColor } from '../../color';
import type { TStoreDoc, TStoreField, TStoreFieldType, TStoreFieldValue, TStorePersistDoc } from './t_store_doc';

const BLACK: TColor = { r: 0, g: 0, b: 0, a: 1 };

const FIELD_TYPES = ['number', 'string', 'boolean', 'vec2', 'vec3', 'color'] as const;

/**
 * What a freshly added field of each type holds.
 *
 * A form has to put **something** in a row the moment it is added, and every one of these is the
 * quietest thing of its kind: zero, nothing written, off, the origin, black.
 * @param type - The field's type.
 * @returns Its quietest value.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const defaultStoreFieldValue = (type: TStoreFieldType): TStoreFieldValue => {
    switch (type) {
        case 'number': return 0;
        case 'string': return '';
        case 'boolean': return false;
        case 'vec2': return { x: 0, y: 0 };
        case 'vec3': return { x: 0, y: 0, z: 0 };
        case 'color': return { ...BLACK };
        default: {
            const never: never = type;
            return never;
        }
    }
};

/**
 * One value, read as the kind its row says it is rather than as whatever it looks like.
 */
const parseValue = (type: TStoreFieldType, raw: unknown): TStoreFieldValue => {
    const record = asRecord(raw);
    switch (type) {
        case 'number': return asNumber(raw, 0);
        case 'string': return asString(raw, '');
        case 'boolean': return asBoolean(raw, false);
        case 'vec2': return { x: asNumber(record?.x, 0), y: asNumber(record?.y, 0) };
        case 'vec3': return { x: asNumber(record?.x, 0), y: asNumber(record?.y, 0), z: asNumber(record?.z, 0) };
        case 'color': return asColor(raw, BLACK);
        default: {
            const never: never = type;
            return never;
        }
    }
};

const parseField = (raw: unknown): TStoreField | null => {
    const record = asRecord(raw);
    const name = asString(record?.name, '');
    if (record === null || name === '') {
        return null;
    }
    // A row of a kind this version does not know is dropped rather than guessed at: a guess would
    // put a value of the wrong shape into the state, which is the one thing the types exist to
    // stop.
    if (!FIELD_TYPES.includes(record.type as TStoreFieldType)) {
        return null;
    }
    const type = record.type as TStoreFieldType;
    return { name, type, value: parseValue(type, record.value) };
};

const parsePersist = (raw: unknown): TStorePersistDoc | undefined => {
    const record = asRecord(raw);
    if (record === null || (record.adapter !== 'localStorage' && record.adapter !== 'indexedDb')) {
        return undefined;
    }
    return {
        adapter: record.adapter,
        ...(record.mode !== undefined ? { mode: asOneOf(record.mode, ['auto', 'manual'] as const, 'auto') } : {}),
        ...(record.throttle !== undefined ? { throttle: asNumber(record.throttle, 250) } : {}),
        ...(record.dbName !== undefined ? { dbName: asString(record.dbName, '') } : {}),
    };
};

/**
 * Reads a store file, whatever state it is in.
 *
 * **Total and it never throws**, the same as the scene reader and for the same reason: a project
 * that refused to open because one row of one file was malformed is a project nobody can repair.
 * A row it cannot make sense of is left out and said out loud; everything else opens.
 *
 * @param raw The parsed JSON.
 * @param src Where it came from, named in anything it has to report.
 * @returns The file, always: whatever could not be read is left out, with a warning.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const parseStoreDoc = (raw: unknown, src: string): TStoreDoc => {
    const record = asRecord(raw) ?? {};
    if (record.format !== undefined && record.format !== STORE_FORMAT) {
        console.warn(`[NacatamalOn] store "${src}": this says it is a "${String(record.format)}" and not a ${STORE_FORMAT}. Read anyway.`);
    }

    const rows = asArray(record.fields);
    const fields: TStoreField[] = [];
    const dropped: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        const field = parseField(row);
        if (field === null) {
            dropped.push(typeof asRecord(row)?.name === 'string' ? String(asRecord(row)?.name) : '(no name)');
            continue;
        }
        // One name is one field. The first wins, because a later row silently replacing an earlier
        // one would make a file where the second half matters and the first does not.
        if (seen.has(field.name)) {
            dropped.push(field.name);
            continue;
        }
        seen.add(field.name);
        fields.push(field);
    }

    if (dropped.length > 0) {
        console.warn(`[NacatamalOn] store "${src}": ${dropped.length} field(s) this version cannot read (${dropped.join(', ')}). The store opens without them.`);
    }

    const persist = parsePersist(record.persist);
    return {
        format: STORE_FORMAT,
        version: STORE_VERSION,
        // The file's own name is the better answer and the host knows it, so a document with no key
        // is not a failure here: it is a key the caller passes in as `src`'s stem.
        key: asString(record.key, ''),
        fields,
        ...(persist !== undefined ? { persist } : {}),
    };
};
