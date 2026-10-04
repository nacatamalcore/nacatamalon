import type { TColor } from '../../color';

/**
 * The name at the top of every store file, so that a tool opening one can tell what it is holding
 * before it reads a single field.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const STORE_FORMAT = 'nacatamalon-store';

/**
 * The version of the layout below.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const STORE_VERSION = 1;

/**
 * What a store field can hold.
 *
 * **A short, flat list, and deliberately so.** That a store's state is plain JSON is what holds up
 * the saving, the tools and the whole idea of writing a game down, and a free-form field in a form
 * would be the first place where somebody puts a `Map` into it and finds out three features later.
 * A typed row cannot express one.
 *
 * It says `'boolean'` where core's format says `'bool'`, because `TScriptField` in this engine
 * already says `'boolean'`: being consistent inside one engine is worth more than matching a
 * format that belongs to the other one, whose files are told apart by their own name anyway.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStoreFieldType = 'number' | 'string' | 'boolean' | 'vec2' | 'vec3' | 'color';

/**
 * The value a field holds, by its type.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStoreFieldValue =
    | number
    | string
    | boolean
    | { x: number; y: number }
    | { x: number; y: number; z: number }
    | TColor;

/**
 * One authored entry of a store's starting state: the name it takes in the state, its type and its
 * value.
 *
 * A list rather than an object, for two reasons that only show up later: a tool can keep the rows
 * in the order somebody put them in, and a type survives a value that happens to look like another
 * one (nothing tells `0` from a number meant as a number, and `{ x, y }` from a pair meant as a
 * place, once the type is gone).
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStoreField = {
    name: string;
    type: TStoreFieldType;
    value: TStoreFieldValue;
};

/**
 * How a store saves itself, as a file can say it: the adapter **named** rather than built, since
 * JSON cannot hold a function.
 *
 * Only read for a store the document is the only thing defining. A store its own code declared
 * keeps its own saving, because saving is behaviour and behaviour lives in code.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStorePersistDoc = {
    adapter: 'localStorage' | 'indexedDb';
    mode?: 'auto' | 'manual';
    /**
     * How long the trailing throttle waits, in milliseconds.
     */
    throttle?: number;
    /**
     * The database's name, for `indexedDb`. Ignored by the other one.
     */
    dbName?: string;
};

/**
 * A store as a file: the state a game starts with, written down.
 *
 * **This is the half of a store that a tool can make.** `createGameStore` is code, and code is what
 * a person writes; this is the same store said in data, so that an editor can add a field, change
 * a starting value and show what a project's state even is, none of which is possible when the only
 * definition is a module somebody has to open.
 *
 * The two halves layer, they do not compete: what the code declares is the floor and what the file
 * says lands on top of it, key by key. A field the file does not mention keeps the value the code
 * gave it, which is what makes a store that **gains** a field cost no migration at all.
 *
 * @category Store
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TStoreDoc = {
    format: typeof STORE_FORMAT;
    version: typeof STORE_VERSION;
    /**
     * The store's name: the key `createGameStore` was given, and the key its saved game is written
     * under. By habit it is the file's own name (`stores/pet.store` gives `pet`), so a project's
     * stores can be listed without reading a byte of any of them. It is written down as well so
     * that a file that has been moved still says what it is.
     */
    key: string;
    /**
     * The starting state, one row per field.
     */
    fields: TStoreField[];
    /**
     * How it saves itself, when this file is the only thing defining it.
     */
    persist?: TStorePersistDoc;
};
