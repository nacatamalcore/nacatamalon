/**
 * What travels on the line, both ways, as JSON. Kept apart from everything else so the shape of a
 * message is decided in one place: the server and the players' pages may run different builds of a
 * game for a while, and `v` is what lets a later one tell.
 *
 * A player's game says `hello` once, with the room it wants, and then `msg`, what its actions are
 * (`in`) and, now and then, `ping`. The server answers `welcome` (or `bye`, refusing), then tells
 * who comes and goes (`join`, `leave`), sends the room's messages (`msg`), makes and ends the shared
 * objects (`spawn`, `gone`), says where they all are (`snap`), answers `pong`, and says `bye` with
 * the reason before it ends a line itself.
 */

/** The version of these messages. */
export const WIRE_VERSION = 1;

/**
 * What a player's game sends.
 *
 * @internal
 */
export type TClientWire =
    | { k: 'hello'; v: number; room: string; token: string | null }
    | { k: 'msg'; t: string; d?: unknown }
    | TInputWire
    | { k: 'ping'; n: number };

/**
 * A player's actions for one of its steps: `s` counts them, `d` is how long the step lasted, `t` is the server's time the player was
 * looking at, `v` how far each action is pressed (left out when not at all), `p` and `r` the ones
 * pressed and let go in that step, `e` whether one comes every step (the player moves something of
 * its own ahead of the server) or only when something changes.
 *
 * @internal
 */
export type TInputWire = { k: 'in'; s: number; t: number; d?: number; e: 0 | 1; v: Record<string, number>; p?: string[]; r?: string[] };

/**
 * One shared object in a snapshot: its id, its placement (`0` when it did not change), the fields
 * that changed (`0` when none did), and, when some were taken out, their names.
 *
 * @internal
 */
export type TSnapEntry = [id: string, state: number[] | null | 0, fields: Record<string, unknown> | 0, removed?: string[]];

/**
 * What the server sends.
 *
 * @internal
 */
export type TServerWire =
    | { k: 'welcome'; v: number; id: string; room: string; players: string[]; r: number }
    | { k: 'join'; id: string }
    | { k: 'leave'; id: string }
    | { k: 'msg'; t: string; d?: unknown }
    | { k: 'bye'; reason: string }
    | { k: 'spawn'; id: string; kind: string; a: unknown[]; s: number[] | null; f: Record<string, unknown>; o: string | null }
    | { k: 'gone'; id: string }
    | { k: 'snap'; t: number; a: number; b: TSnapEntry[] }
    | { k: 'pong'; n: number };

/**
 * A message as text. What JSON cannot hold (a cycle, a `BigInt`) is said with who sent it, rather
 * than lost on the way.
 *
 * @internal
 */
export const encodeWire = (who: string, message: TClientWire | TServerWire): string => {
    try {
        return JSON.stringify(message);
    } catch (error) {
        const type = message.k === 'msg' ? ` '${message.t}'` : '';
        throw new Error(`[NacatamalOn] ${who}: the message${type} could not be written as JSON (${(error as Error).message}). Send plain data: numbers, strings, booleans, arrays and objects of them.`);
    }
};

const isText = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNumbers = (value: unknown): value is number[] => Array.isArray(value) && value.every(isNumber);
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A snapshot's entries, or `null` when any of them is not one. */
const snapEntries = (value: unknown): TSnapEntry[] | null => {
    if (!Array.isArray(value)) return null;
    for (const entry of value) {
        if (!Array.isArray(entry) || !isText(entry[0])) return null;
        if (entry[1] !== 0 && entry[1] !== null && !isNumbers(entry[1])) return null;
        if (entry[2] !== 0 && !isRecord(entry[2])) return null;
        if (entry[3] !== undefined && (!Array.isArray(entry[3]) || !entry[3].every(isText))) return null;
    }
    return value as TSnapEntry[];
};

/**
 * What a player's game sent, or `null` for anything that is not one of its messages.
 *
 * @internal
 */
export const decodeClientWire = (text: string): TClientWire | null => {
    let value: { k?: unknown; v?: unknown; room?: unknown; token?: unknown; t?: unknown; d?: unknown; s?: unknown; e?: unknown; p?: unknown; r?: unknown; n?: unknown };
    try {
        value = JSON.parse(text);
    } catch {
        return null;
    }
    if (value === null || typeof value !== 'object') return null;
    if (value.k === 'hello' && isText(value.room) && typeof value.v === 'number' && (value.token === null || isText(value.token))) {
        return { k: 'hello', v: value.v, room: value.room, token: value.token };
    }
    if (value.k === 'msg' && isText(value.t)) {
        return { k: 'msg', t: value.t, d: value.d };
    }
    if (value.k === 'in') {
        return decodeInput(value);
    }
    if (value.k === 'ping' && isNumber(value.n)) {
        return { k: 'ping', n: value.n };
    }
    return null;
};

/** The most actions a player's message may name: more is not a game's map, it is someone trying. */
const MOST_ACTIONS = 64;

/** Names of actions, or `undefined` for what is not a short list of them. */
const namesIn = (value: unknown): string[] | undefined => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > MOST_ACTIONS || !value.every(isText)) return undefined;
    return value;
};

/**
 * A player's actions, checked as what they are: something anyone could have written. Every value is
 * a number from 0 to 1, and a list too long to be a game's map is not read at all.
 */
const decodeInput = (value: { s?: unknown; t?: unknown; d?: unknown; e?: unknown; v?: unknown; p?: unknown; r?: unknown }): TInputWire | null => {
    if (!isNumber(value.s) || !isNumber(value.t) || value.v === null || typeof value.v !== 'object' || Array.isArray(value.v)) return null;
    const entries = Object.entries(value.v as Record<string, unknown>);
    if (entries.length > MOST_ACTIONS) return null;
    const values: Record<string, number> = {};
    for (const [name, amount] of entries) {
        if (!isNumber(amount)) return null;
        values[name] = Math.min(1, Math.max(0, amount));
    }
    const pressed = namesIn(value.p);
    const released = namesIn(value.r);
    if (pressed === undefined || released === undefined) return null;
    const length = isNumber(value.d) && value.d > 0 ? value.d : undefined;
    return { k: 'in', s: value.s, t: value.t, ...(length === undefined ? {} : { d: length }), e: value.e === 1 ? 1 : 0, v: values, p: pressed, r: released };
};

/**
 * What the server sent, or `null` for anything that is not one of its messages.
 *
 * @internal
 */
export const decodeServerWire = (text: string): TServerWire | null => {
    let value: {
        k?: unknown; v?: unknown; id?: unknown; room?: unknown; players?: unknown; t?: unknown; d?: unknown; reason?: unknown;
        r?: unknown; kind?: unknown; a?: unknown; s?: unknown; f?: unknown; o?: unknown; b?: unknown; n?: unknown;
    };
    try {
        value = JSON.parse(text);
    } catch {
        return null;
    }
    if (value === null || typeof value !== 'object') return null;
    switch (value.k) {
        case 'welcome':
            return isText(value.id) && isText(value.room) && typeof value.v === 'number' && Array.isArray(value.players) && value.players.every(isText)
                ? { k: 'welcome', v: value.v, id: value.id, room: value.room, players: value.players, r: isNumber(value.r) && value.r > 0 ? value.r : 20 }
                : null;
        case 'join':
        case 'leave':
            return isText(value.id) ? { k: value.k, id: value.id } : null;
        case 'msg':
            return isText(value.t) ? { k: 'msg', t: value.t, d: value.d } : null;
        case 'bye':
            return { k: 'bye', reason: isText(value.reason) ? value.reason : 'closed' };
        case 'spawn':
            return isText(value.id) && isText(value.kind) && Array.isArray(value.a) && (value.s === null || isNumbers(value.s)) && isRecord(value.f) && (value.o === null || isText(value.o))
                ? { k: 'spawn', id: value.id, kind: value.kind, a: value.a, s: value.s, f: value.f, o: value.o }
                : null;
        case 'gone':
            return isText(value.id) ? { k: 'gone', id: value.id } : null;
        case 'snap': {
            const entries = snapEntries(value.b);
            return isNumber(value.t) && isNumber(value.a) && entries !== null ? { k: 'snap', t: value.t, a: value.a, b: entries } : null;
        }
        case 'pong':
            return isNumber(value.n) ? { k: 'pong', n: value.n } : null;
        default:
            return null;
    }
};
