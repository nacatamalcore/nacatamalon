import { reportNetError } from './report_net_error';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';
import type { TNetGame } from './net_game';
import type { TStoreEntry } from './protocol';
import type { TRoomStore, TRoomStoreDecl, TRoomStoreValue } from './types/t_room_store';

type TPlain = Record<string, unknown>;

type TWatcher = {
    box: TBox | null;
    selector: (state: never) => unknown;
    listener: (value: unknown, previous: unknown) => void;
    equals: (a: unknown, b: unknown) => boolean;
    last: unknown;
    on: boolean;
};

/**
 * One game's store of one declaration.
 */
type TInstance = {
    decl: TRoomStoreDecl<TPlain>;
    /** Frozen; replaced whole by each change, keeping the object of every key that did not change. */
    state: TPlain;
    /** Each key's value as text, to tell what changed without walking it. */
    json: Map<string, string>;
    /** The room: each key as the players were last told it. */
    sent: Map<string, string>;
    /** The room: the keys changed since the players were last told. */
    dirty: Set<string>;
    /** The room: never told yet, so the first time goes whole. */
    fresh: boolean;
    watchers: TWatcher[];
    closed: boolean;
    toldClosed: boolean;
    toldReturned: boolean;
};

/**
 * A game's room stores, and, in a player's game, every store the room has sent, asked for or not:
 * a HUD that asks for one after the room's picture came sees the room's, not the starting values.
 */
type TGameStores = {
    instances: Map<string, TInstance>;
    received: Map<string, TPlain>;
    /** A player's game: the line whose whole room's stores have arrived, `-1` before any. */
    wholeLine: number;
};

const games = new WeakMap<TRuntimeStore, TGameStores>();

const storesOf = (store: TRuntimeStore): TGameStores => {
    let stores = games.get(store);
    if (stores === undefined) {
        stores = { instances: new Map(), received: new Map(), wholeLine: -1 };
        games.set(store, stores);
    }
    return stores;
};

/**
 * Throws, saying where, unless `value` is what can travel as text and come back the same: no
 * holes in an array, no object that holds itself, no key that JSON would read back as something else.
 *
 * @internal
 */
export const checkPlain = (who: string, value: unknown, path: string, holding: Set<object> = new Set()): void => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') {
        if (Number.isFinite(value)) return;
        throw new Error(`[NacatamalOn] ${who}: ${path} is ${String(value)}, which does not travel. Keep to finite numbers.`);
    }
    const plainObject = typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    if (Array.isArray(value) || plainObject) {
        if (holding.has(value as object)) {
            throw new Error(`[NacatamalOn] ${who}: ${path} holds itself, which does not travel. Keep a store a tree: name what it points at (an id) instead.`);
        }
        holding.add(value as object);
        // What JSON leaves behind: a symbol, a property that is not enumerable (a getter hidden with
        // defineProperty), and, on an array, any name that is not one of its places.
        for (const key of Reflect.ownKeys(value as object)) {
            if (Array.isArray(value) && key === 'length') continue;
            const name = typeof key === 'symbol' ? key.toString() : key;
            if (typeof key === 'symbol' || !Object.prototype.propertyIsEnumerable.call(value, key)) {
                throw new Error(`[NacatamalOn] ${who}: ${path} has a ${typeof key === 'symbol' ? 'symbol' : 'hidden'} key, ${name}, which does not travel. Keep to plain keys.`);
            }
            if (Array.isArray(value) && !(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length)) {
                throw new Error(`[NacatamalOn] ${who}: ${path} is an array with a key called '${name}', which does not travel. Keep it in an object beside the array.`);
            }
        }
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                if (!(i in value)) {
                    throw new Error(`[NacatamalOn] ${who}: ${path}[${i}] is a hole in the array, which arrives as null. Fill it (null, 0) or leave the array shorter.`);
                }
                checkPlain(who, value[i], `${path}[${i}]`, holding);
            }
        } else {
            for (const [key, item] of Object.entries(value as object)) {
                if (key === '__proto__') {
                    throw new Error(`[NacatamalOn] ${who}: ${path} has a key called __proto__, which does not come back as a key. Call it something else.`);
                }
                checkPlain(who, item, `${path}.${key}`, holding);
            }
        }
        holding.delete(value as object);
        return;
    }
    const kind = typeof value === 'object' ? (value as object).constructor?.name ?? 'object' : typeof value;
    throw new Error(`[NacatamalOn] ${who}: ${path} is ${kind === 'undefined' ? 'undefined' : `a ${kind}`}, which does not travel. A room store holds plain data: numbers, strings, booleans, null, arrays and objects of them.`);
};

/**
 * Freezes a value all the way down, and hands it back. Everything in it, even what was frozen
 * already: an object frozen only on the outside would leave what it holds open.
 *
 * @internal
 */
export const deepFreeze = <T>(value: T): T => {
    if (value !== null && typeof value === 'object') {
        for (const item of Object.values(value)) deepFreeze(item);
        Object.freeze(value);
    }
    return value;
};

const isRecord = (value: unknown): value is TPlain => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Whether two values of plain data hold the same. */
const sameData = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (Array.isArray(a)) {
        return Array.isArray(b) && a.length === b.length && a.every((item, i) => sameData(item, b[i]));
    }
    if (isRecord(a) && isRecord(b)) {
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameData(a[key], b[key]));
    }
    return false;
};

/**
 * `next`, frozen, keeping every branch of `old` that holds the same: a watcher that picks out a
 * branch nothing changed is not told.
 */
const share = (old: unknown, next: unknown): unknown => {
    if (sameData(old, next)) return old;
    if (Array.isArray(old) && Array.isArray(next)) {
        return Object.freeze(next.map((item, i) => (i < old.length ? share(old[i], item) : deepFreeze(item))));
    }
    if (isRecord(old) && isRecord(next)) {
        const out: TPlain = {};
        for (const key of Object.keys(next)) out[key] = Object.hasOwn(old, key) ? share(old[key], next[key]) : deepFreeze(next[key]);
        return Object.freeze(out);
    }
    return deepFreeze(next);
};

/**
 * Throws unless `decl` is what `createRoomStore` gives.
 *
 * @internal
 */
export const checkRoomStoreDecl = (who: string, decl: unknown): void => {
    const value = decl as Partial<TRoomStoreDecl<TPlain>> | null;
    if (value === null || typeof value !== 'object' || typeof value.key !== 'string' || value.initial === undefined) {
        throw new Error(`[NacatamalOn] ${who}: it takes a store declared with createRoomStore, and got ${decl === null ? 'null' : typeof decl}.`);
    }
};

const isWritable = (game: TNetGame, instance: TInstance): boolean =>
    !instance.closed && (game.role === 'server' || game.lineCount === 0);

/**
 * In a player's game, from the moment the whole room's stores arrive on the line it is on (just
 * before it sees the room, so a watcher told of them already reads `true`) until that line goes.
 */
const isReady = (store: TRuntimeStore, game: TNetGame, instance: TInstance): boolean => {
    if (game.role === 'server') return !instance.closed;
    if (game.lineCount === 0) return true;
    return (game.status === 'connecting' || game.status === 'online') && storesOf(store).wholeLine === game.lineCount;
};

/** Tells everyone watching, each on their own so one that throws costs only itself. */
const notify = (store: TRuntimeStore, instance: TInstance): void => {
    for (const watcher of [...instance.watchers]) {
        if (!watcher.on || watcher.box?.destroyed === true) continue;
        try {
            const value = watcher.selector(instance.state as never);
            if (watcher.equals(watcher.last, value)) continue;
            const previous = watcher.last;
            watcher.last = value;
            watcher.listener(value, previous);
        } catch (error) {
            reportNetError(store, error, `a watch of room store '${instance.decl.key}'`);
        }
    }
};

/**
 * Makes `next` what the store holds: what did not change keeps its object, all the way down, the
 * rest is frozen, and, if anything changed, everyone watching is told. `next` is the store's from
 * here on: nothing else may hold it.
 */
const install = (store: TRuntimeStore, instance: TInstance, next: TPlain): void => {
    const state: TPlain = {};
    let changed = false;
    for (const key of Object.keys(next)) {
        const text = JSON.stringify(next[key]);
        if (instance.json.get(key) === text) {
            state[key] = instance.state[key];
            continue;
        }
        state[key] = Object.hasOwn(instance.state, key) ? share(instance.state[key], next[key]) : deepFreeze(next[key]);
        instance.json.set(key, text);
        instance.dirty.add(key);
        changed = true;
    }
    for (const key of Object.keys(instance.state)) {
        if (Object.hasOwn(next, key)) continue;
        instance.json.delete(key);
        instance.dirty.add(key);
        changed = true;
    }
    if (!changed) return;
    instance.state = Object.freeze(state);
    notify(store, instance);
};

/**
 * This game's store of `decl`, made the first time it is asked for.
 *
 * @internal
 */
export const roomStoreInstance = (store: TRuntimeStore, game: TNetGame, decl: TRoomStoreDecl<TPlain>, who: string): TInstance => {
    const stores = storesOf(store);
    if (decl.serverOnly && game.role === 'client' && game.lineCount > 0) {
        throw new Error(`[NacatamalOn] ${who}: the room store '${decl.key}' is serverOnly, so it lives in the room and never reaches a player's game. Read it in the room (useNet().role === 'server'), or make it travel by leaving out serverOnly.`);
    }
    const known = stores.instances.get(decl.key);
    if (known !== undefined) {
        if (known.decl !== decl) {
            throw new Error(`[NacatamalOn] ${who}: two room stores are called '${decl.key}' in this game. A key names one store: give the other a name of its own, or import the same createRoomStore in both places.`);
        }
        return known;
    }
    const start = (game.role === 'client' && !decl.serverOnly ? stores.received.get(decl.key) : undefined) ?? (decl.initial as TPlain);
    const instance: TInstance = {
        decl,
        state: deepFreeze(start === decl.initial ? start : structuredClone(start)),
        json: new Map(Object.entries(start).map(([key, value]) => [key, JSON.stringify(value)])),
        sent: new Map(),
        dirty: new Set(),
        fresh: game.role === 'server',
        watchers: [],
        closed: false,
        toldClosed: false,
        toldReturned: false,
    };
    stores.instances.set(decl.key, instance);
    return instance;
};

/**
 * The handle on one game's store, its watchers going with `box` when there is one.
 *
 * @internal
 */
export const roomStoreHandle = <S extends TPlain>(store: TRuntimeStore, game: TNetGame, instance: TInstance, box: TBox | null): TRoomStore<S> => {
    const key = instance.decl.key;
    const who = `room store '${key}'`;
    return {
        key,
        get state() { return instance.state as TRoomStoreValue<S>; },
        get writable() { return isWritable(game, instance); },
        get ready() { return isReady(store, game, instance); },
        set: (change) => {
            if (typeof change !== 'function') {
                throw new Error(`[NacatamalOn] ${who}: set takes a function that changes the state it is given, as in set((s) => { s.score += 1; }), and got ${typeof change}.`);
            }
            if (instance.closed) {
                if (!instance.toldClosed) {
                    instance.toldClosed = true;
                    console.warn(`[NacatamalOn] ${who}: set after its room was destroyed, so nothing changed (said once). Something that waited (an await, a timer) came back after the room ended; check that the room is still on before changing it.`);
                }
                return;
            }
            if (!isWritable(game, instance)) {
                throw new Error(`[NacatamalOn] ${who}: set in a player's game, which only reads it: the server decides. Change it in the room, where writable is true, and every player sees it a moment later.`);
            }
            // A copy to change: if `change` throws halfway, the store is as it was.
            const draft = structuredClone(instance.state) as S;
            const given: unknown = change(draft);
            // What `change` hands back is not the store (it changes its argument): said once, when
            // it handed back an object and left the argument as it was, the way a reset is
            // mistaken for set(() => ({ …start })).
            if (given !== null && typeof given === 'object' && !Array.isArray(given) && given !== draft && !instance.toldReturned && sameData(draft, instance.state)) {
                instance.toldReturned = true;
                console.warn(`[NacatamalOn] ${who}: set's function handed back an object and changed nothing, so the store stays as it was (said once). It changes the state it is given, in place: set((s) => { Object.assign(s, start); }).`);
            }
            if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) {
                throw new Error(`[NacatamalOn] ${who}: set's function changes the state it is given in place; the state is an object.`);
            }
            checkPlain(who, draft, key);
            // A copy of what `change` left: what it put in (an array of the caller's, an object
            // frozen only on the outside) stays the caller's, and the store's is wholly its own.
            install(store, instance, structuredClone(draft) as TPlain);
        },
        watch: (selector, listener, equals = Object.is) => {
            if (typeof selector !== 'function' || typeof listener !== 'function' || typeof equals !== 'function') {
                throw new Error(`[NacatamalOn] ${who}: watch takes what to pick out of the state and a function to call when it changes, as in watch((s) => s.score, (score) => …).`);
            }
            // Asked for by an object that has gone, or on a store that has closed: nothing to call.
            if (box?.destroyed === true || instance.closed) return () => {};
            const watcher: TWatcher = {
                box,
                selector: selector as (state: never) => unknown,
                listener: listener as (value: unknown, previous: unknown) => void,
                equals: equals as (a: unknown, b: unknown) => boolean,
                last: selector(instance.state as TRoomStoreValue<S>),
                on: true,
            };
            instance.watchers.push(watcher);
            const off = () => {
                watcher.on = false;
                instance.watchers = instance.watchers.filter((existing) => existing !== watcher);
            };
            box?.cleanups.push(off);
            return off;
        },
    };
};

/** One store's keys, as `{"key":value,…}`, from the text already kept. */
const wholeText = (instance: TInstance): string =>
    `{${[...instance.json].map(([key, text]) => `${JSON.stringify(key)}:${text}`).join(',')}}`;

/**
 * The room: what its stores changed since the players were last told, as an `st`, or `null` when
 * nothing did. Only the keys marked by a change are looked at.
 *
 * @internal
 */
export const flushRoomStores = (store: TRuntimeStore): string | null => {
    const stores = games.get(store);
    if (stores === undefined) return null;
    const parts: string[] = [];
    for (const instance of stores.instances.values()) {
        if (instance.decl.serverOnly) {
            instance.dirty.clear();
            continue;
        }
        if (!instance.fresh && instance.dirty.size === 0) continue;
        const name = JSON.stringify(instance.decl.key);
        if (instance.fresh) {
            instance.fresh = false;
            instance.dirty.clear();
            instance.sent = new Map(instance.json);
            parts.push(`${name}:[1,${wholeText(instance)}]`);
            continue;
        }
        const values: string[] = [];
        const removed: string[] = [];
        for (const key of instance.dirty) {
            const text = instance.json.get(key);
            if (text === undefined) {
                if (instance.sent.delete(key)) removed.push(key);
            } else if (instance.sent.get(key) !== text) {
                instance.sent.set(key, text);
                values.push(`${JSON.stringify(key)}:${text}`);
            }
        }
        instance.dirty.clear();
        if (values.length === 0 && removed.length === 0) continue;
        parts.push(`${name}:[0,{${values.join(',')}}${removed.length > 0 ? `,${JSON.stringify(removed)}` : ''}]`);
    }
    return parts.length > 0 ? `{"k":"st","s":{${parts.join(',')}}}` : null;
};

/**
 * The room: every store that travels, whole, for a player who just came. What the others are still
 * owed is not spent on it.
 *
 * @internal
 */
export const wholeRoomStores = (store: TRuntimeStore): string => {
    const parts: string[] = [];
    for (const instance of games.get(store)?.instances.values() ?? []) {
        if (instance.decl.serverOnly) continue;
        parts.push(`${JSON.stringify(instance.decl.key)}:[1,${wholeText(instance)}]`);
    }
    return `{"k":"st","f":1,"s":{${parts.join(',')}}}`;
};

/**
 * The room has ended: its stores stop changing and nobody is told any more.
 *
 * @internal
 */
export const closeRoomStores = (store: TRuntimeStore): void => {
    for (const instance of games.get(store)?.instances.values() ?? []) {
        instance.closed = true;
        instance.watchers = [];
    }
};

/**
 * A player's game moving to another room on the same line: its stores keep what they have, and are
 * not `ready` until the new room's arrive whole.
 *
 * @internal
 */
export const awaitWholeRoomStores = (store: TRuntimeStore): void => {
    storesOf(store).wholeLine = -1;
};

/**
 * A player's game: what the room said of its stores, kept for every store and laid on the ones this
 * game has asked for, all of them changed before anyone watching is told. `full` is the whole room,
 * which replaces what was kept.
 *
 * @internal
 */
export const applyRoomStores = (store: TRuntimeStore, full: boolean, entries: Record<string, TStoreEntry>, line: number): void => {
    const stores = storesOf(store);
    if (full) {
        stores.received = new Map();
        stores.wholeLine = line;
    }
    for (const [key, [whole, values, removed]] of Object.entries(entries)) {
        const data: TPlain = whole === 1 ? {} : { ...(stores.received.get(key) ?? {}) };
        Object.assign(data, values);
        for (const name of removed ?? []) delete data[name];
        stores.received.set(key, data);
    }
    const touched = [...stores.instances.values()].filter((instance) => !instance.decl.serverOnly && (full || Object.hasOwn(entries, instance.decl.key)));
    // Every store first, then the watchers: one that reads another store sees it changed too.
    const watchers = new Map<TInstance, TWatcher[]>();
    for (const instance of touched) {
        watchers.set(instance, instance.watchers);
        instance.watchers = [];
        install(store, instance, stores.received.get(instance.decl.key) ?? (instance.decl.initial as TPlain));
    }
    for (const [instance, list] of watchers) {
        // Any asked for while the stores changed are kept as well, and any stopped meanwhile go.
        instance.watchers = [...list, ...instance.watchers].filter((watcher) => watcher.on);
        notify(store, instance);
    }
};
