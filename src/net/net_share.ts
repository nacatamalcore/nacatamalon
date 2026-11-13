import { DEFAULT_ACTION_PRESS } from '../DEFAULTS';
import { destroy } from '../destroy';
import { reportFrameError } from '../game/loop/report_frame_error';
import { createInputHandle, neutralInput } from './input_handle';
import type { TBox } from '../box';
import type { TActionDef, TActionsHandle } from '../input';
import type { TRuntimeStore } from '../store';
import type { TInputState } from './input_handle';
import type { TInputWire, TServerWire, TSnapEntry } from './protocol';
import type { TSharedMove } from './types/t_shared';

/**
 * How far back the server keeps where everything was, in seconds: what a player saw is never older
 * than their ping and the interpolation together, and a second is far past both.
 */
const LONGEST_REWIND = 1;

/**
 * How far back `rewind` looks at most when the room does not say, in seconds: a player's ping and
 * the interpolation of a good line, about 200 ms of ping. Further is a player slower than that,
 * or one saying they saw the world earlier than they did.
 *
 * @internal
 */
export const DEFAULT_REWIND_LIMIT = 0.25;

/**
 * How long a player that sends its actions every step may go quiet, in seconds, before the server
 * stops repeating the last ones and takes it as letting go: a hiccup is bridged, a player gone to a
 * menu or a lost line does not keep running.
 */
const STARVE_SECONDS = 0.1;

/**
 * How much of a player's time the server keeps to run later, in seconds: after a hiccup their steps
 * arrive bunched and are run as fast as this allows, catching up; never faster than time really
 * went by, whatever a changed game sends.
 */
const MOST_OWED = 0.25;

/**
 * The most of a player's time that may wait to be run, in seconds: past it, the oldest steps go,
 * so a server slower than its players stays at most this far behind them.
 */
const MOST_QUEUED = 0.25;

/** The longest one of a player's steps may say it lasted, in seconds. */
const LONGEST_STEP = 0.25;

/** What one player may have waiting at most: past it, the oldest go. */
const MOST_WAITING = 120;

/** What a player's game keeps of its own steps the server has not answered yet, at most. */
const MOST_UNANSWERED = 240;

/** How far behind the server a player's game starts showing the others, in seconds, until it knows its line. */
const LEAST_INTERPOLATION = 0.1;

/** The most a player's game stays behind the server on its own, in seconds, however bad the line. */
const MOST_INTERPOLATION = 0.3;

/** A little more than the line asks for, in seconds: what one late message more costs. */
const INTERPOLATION_MARGIN = 0.008;

/** How often a player's game measures its ping, in seconds. */
const PING_EVERY = 1;

/** How quickly the clock's estimate follows a server that answers later than before. */
const CLOCK_DRIFT = 0.02;

/**
 * How much of the gap to where the others should be shown is closed in a step. The time they are
 * shown at always moves on at the game's pace and only leans towards the estimate, so a message that
 * comes early does not make everything jump ahead.
 */
const CATCH_UP = 0.05;

/** A gap bigger than this, in seconds, is not leaned across but jumped: a hiccup, a new line. */
const JUMP = 0.25;

/**
 * One object every game in the room sees: what makes it, whose it is, what of it travels, and, on
 * each side, what that side keeps to tell it or to show it.
 *
 * @internal
 */
export type TSharedEntry = {
    id: string;
    box: TBox;
    /** The spawner's name when `useNetSpawn` made it; `null` for one each game builds itself. */
    kind: string | null;
    owner: string | null;
    move: TSharedMove | null;
    smooth: boolean;
    fields: Record<string, unknown>;
    gone: boolean;
    /** The server: whether it still has to be told whole, and how it was last told. */
    fresh: boolean;
    sentState: number[] | null;
    sentFields: Map<string, string>;
    /** The server: fields taken out since it was made, so whoever comes later takes them out too. */
    removedFields: Set<string>;
    /** The server: where it was in each step of the last second, for `rewind`. */
    history: Array<{ t: number; s: number[] | null }>;
    /** A player's game: where the server said it was, and when, to be shown a little later. */
    samples: Array<{ t: number; s: number[] | null }>;
    fieldQueue: Array<{ t: number; f: Record<string, unknown>; r?: string[] }>;
    /** A player's game, for its own object: what the server last decided, to start again from. */
    authority: { s: number[] | null; f: Record<string, unknown> | 0; r?: string[]; ack: number } | null;
    /** A player's game: kept out of sight until the server says where it is. */
    hidden: { visible: boolean } | null;
};

/**
 * A player's actions as the server has them.
 */
type TPlayerInput = {
    queue: TInputWire[];
    state: { values: Record<string, number>; pressed: Set<string>; released: Set<string>; held: Map<string, number> };
    /** The last of the player's steps the server has run, and the time the player was looking at then. */
    ack: number;
    view: number | null;
    stream: boolean;
    /** Seconds with nothing from a player that sends every step. */
    starve: number;
    /** The server's time not yet spent on this player's steps. */
    owed: number;
    /** What the quiet let go of, to be pressed again when the player's steps come back still holding it. */
    dropped: Set<string>;
};

/** One of a player's steps to run: how the actions were, and how long the step lasted. */
type TRunStep = { input: TInputState; dt: number };

/**
 * One of a player's own steps, kept until the server says it ran it.
 */
type TRecordedStep = { seq: number; input: TInputState; dt: number };

/**
 * A spawner of `useNetSpawn`, by its name: what makes the object, and the object that asked for it.
 */
type TSpawner = { spawn: (...args: unknown[]) => TBox; box: TBox };

/**
 * Everything a game keeps to share objects over the network.
 *
 * @internal
 */
export type TShareState = {
    entries: Map<string, TSharedEntry>;
    byBox: WeakMap<TBox, TSharedEntry>;
    spawners: Map<string, TSpawner>;
    /** The spawn going on now, so the `useShared` inside it takes its id. */
    spawning: { id: string; kind: string; box: TBox | null; owner: string | null | undefined } | null;
    nextId: number;
    /** Seconds this game has run on the network's clock: the steps, and real time while paused. */
    clock: number;
    /** The server. */
    stepsPerSend: number;
    /** The server: how far back `rewind` may look, in seconds, whatever a player says. */
    rewindLimit: number;
    sinceSend: number;
    sendRate: number;
    inputs: Map<string, TPlayerInput>;
    toldJson: boolean;
    /** A player's game. */
    offset: number | null;
    /** The server's time the others are shown at now, moving on smoothly. */
    shown: number | null;
    lastSnap: number | null;
    interpolation: number;
    /** Whether the game left the interpolation to the line: then it follows how the line behaves. */
    adaptive: boolean;
    /** How late the server's messages come against the soonest one, in seconds: the line's jitter. */
    jitter: number;
    pending: Map<string, { s: number[] | null | undefined; f: Record<string, unknown>; r?: Set<string> }>;
    seq: number;
    unanswered: TRecordedStep[];
    lastSent: string;
    /** Whether the last step's actions went every step. */
    streaming: boolean;
    /** What the server made before this game had its spawner, by the spawner's name. */
    orphans: Map<string, Array<Extract<TServerWire, { k: 'spawn' }>>>;
    lastPing: number;
    ping: number | null;
    toldKinds: Set<string>;
};

/**
 * Nothing shared yet.
 *
 * @internal
 */
export const emptyShare = (): TShareState => ({
    entries: new Map(),
    byBox: new WeakMap(),
    spawners: new Map(),
    spawning: null,
    nextId: 0,
    clock: 0,
    stepsPerSend: 1,
    rewindLimit: DEFAULT_REWIND_LIMIT,
    sinceSend: 0,
    sendRate: 20,
    inputs: new Map(),
    toldJson: false,
    offset: null,
    shown: null,
    lastSnap: null,
    interpolation: LEAST_INTERPOLATION,
    adaptive: true,
    jitter: 0,
    pending: new Map(),
    seq: 0,
    unanswered: [],
    lastSent: '',
    streaming: false,
    orphans: new Map(),
    lastPing: -Infinity,
    ping: null,
    toldKinds: new Set(),
});

/**
 * What a shared side needs of the rest of the network: who it is, who is in the room, and how to
 * reach them. Kept to this so the sharing can be read without the connection around it.
 *
 * @internal
 */
export type TShareSide = {
    role: 'server' | 'client';
    me: string | null;
    status: string;
    share: TShareState;
    /** The server: the players in the room, and a line of text to one of them or to all. */
    players(): string[];
    post(text: string, to?: string): void;
    /** A player's game: a line of text to the server. */
    send(text: string): void;
};

// Placement as numbers: x, y, z, rotation, scaleX, scaleY, rotationX, rotationY, scaleZ, then the
// quaternion's four when the object turns by one.

/** Which of the numbers are angles, which take the short way round when blended. */
const ANGLES = new Set([3, 6, 7]);

/**
 * Where a box is, as the numbers that travel.
 *
 * @internal
 */
export const stateOf = (box: TBox): number[] | null => {
    const t = box.transform;
    if (t === null) return null;
    const state = [t.x, t.y, t.z, t.rotation, t.scaleX, t.scaleY, t.rotationX, t.rotationY, t.scaleZ];
    if (t.quaternion !== undefined && t.quaternion !== null) state.push(...t.quaternion);
    return state;
};

/**
 * Puts a box where the numbers say.
 *
 * @internal
 */
export const applyState = (box: TBox, state: number[] | null): void => {
    const t = box.transform;
    if (t === null || state === null || state.length < 9) return;
    t.x = state[0];
    t.y = state[1];
    t.z = state[2];
    t.rotation = state[3];
    t.scaleX = state[4];
    t.scaleY = state[5];
    t.rotationX = state[6];
    t.rotationY = state[7];
    t.scaleZ = state[8];
    t.quaternion = state.length >= 13 ? [state[9], state[10], state[11], state[12]] : null;
};

/** An angle from `a` to `b` by the short way. */
const turn = (a: number, b: number, k: number): number => {
    const full = Math.PI * 2;
    const d = ((((b - a) % full) + full * 1.5) % full) - full / 2;
    return a + d * k;
};

/**
 * Between two placements, `k` of the way from `a` to `b`: angles by the short way, a quaternion
 * kept whole.
 *
 * @internal
 */
export const blendState = (a: number[] | null, b: number[] | null, k: number): number[] | null => {
    if (a === null || b === null || a.length !== b.length) return k < 0.5 ? a : b;
    const out = a.map((value, i) => (ANGLES.has(i) ? turn(value, b[i], k) : value + (b[i] - value) * k));
    if (out.length >= 13) {
        // The short way for a quaternion too: one and its negative are the same turn.
        const dot = a[9] * b[9] + a[10] * b[10] + a[11] * b[11] + a[12] * b[12];
        const sign = dot < 0 ? -1 : 1;
        for (let i = 9; i < 13; i++) out[i] = a[i] + (b[i] * sign - a[i]) * k;
        const length = Math.hypot(out[9], out[10], out[11], out[12]) || 1;
        for (let i = 9; i < 13; i++) out[i] /= length;
    }
    return out;
};

const sameState = (a: number[] | null, b: number[] | null): boolean => {
    if (a === null || b === null) return a === b;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
};

/**
 * Where a box was at `t`, from what was kept of it.
 */
const stateAt = (history: Array<{ t: number; s: number[] | null }>, t: number): number[] | null | undefined => {
    if (history.length === 0) return undefined;
    if (t <= history[0].t) return history[0].s;
    for (let i = history.length - 1; i >= 0; i--) {
        const a = history[i];
        if (a.t <= t) {
            const b = history[i + 1];
            if (b === undefined || b.t === a.t) return a.s;
            return blendState(a.s, b.s, (t - a.t) / (b.t - a.t));
        }
    }
    return history[0].s;
};

/**
 * Puts what the server said of an object's fields into them: the new values, and the fields it took
 * out taken out.
 */
const applyFields = (fields: Record<string, unknown>, values: Record<string, unknown> | 0 | undefined, removed: Iterable<string> | undefined): void => {
    if (values !== undefined && values !== 0) Object.assign(fields, values);
    for (const key of removed ?? []) delete fields[key];
};

/**
 * Makes a box one every game in the room sees, under `id`.
 *
 * @internal
 */
export const addShared = (
    side: TShareSide,
    box: TBox,
    id: string,
    options: { kind: string | null; owner: string | null; move: TSharedMove | null; smooth: boolean; fields: Record<string, unknown> },
): TSharedEntry => {
    const share = side.share;
    const before = share.entries.get(id);
    if (before !== undefined && !before.gone && !before.box.destroyed) {
        throw new Error(`[NacatamalOn] useShared: '${id}' is already the key of '${before.box.name}', and a key names one object in the room. Give each its own (a door's could be 'door-1').`);
    }
    const entry: TSharedEntry = {
        id,
        box,
        kind: options.kind,
        owner: options.owner,
        move: options.move,
        smooth: options.smooth,
        fields: options.fields,
        gone: false,
        fresh: true,
        sentState: null,
        sentFields: new Map(),
        removedFields: new Set(),
        history: [],
        samples: [],
        fieldQueue: [],
        authority: null,
        hidden: null,
    };
    share.entries.set(id, entry);
    share.byBox.set(box, entry);
    box.cleanups.push(() => {
        entry.gone = true;
        // A player's game forgets it at once; the server keeps it until it has told the players.
        if (side.role === 'client' && share.entries.get(id) === entry) share.entries.delete(id);
    });
    if (side.role === 'client') {
        // What the server said of it before this game had built it.
        const waiting = share.pending.get(id);
        if (waiting !== undefined) {
            share.pending.delete(id);
            if (waiting.s !== undefined) {
                applyState(box, waiting.s);
                entry.samples.push({ t: share.lastSnap ?? 0, s: waiting.s });
            }
            applyFields(entry.fields, waiting.f, waiting.r);
        }
    }
    return entry;
};

/**
 * Whether a player's game moves this object itself, ahead of the server.
 *
 * @internal
 */
export const predicted = (side: TShareSide, entry: TSharedEntry): boolean =>
    side.role === 'client' && entry.move !== null && entry.owner !== null && entry.owner === side.me;

// ---------------------------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------------------------

/**
 * Takes a player's actions as they arrive, for the steps to come.
 *
 * @internal
 */
export const receiveInput = (share: TShareState, player: string, wire: TInputWire): void => {
    let input = share.inputs.get(player);
    if (input === undefined) {
        input = {
            queue: [], state: { values: {}, pressed: new Set(), released: new Set(), held: new Map() },
            ack: -1, view: null, stream: false, starve: 0, owed: 0, dropped: new Set(),
        };
        share.inputs.set(player, input);
    }
    input.queue.push(wire);
    if (input.queue.length > MOST_WAITING) input.queue.splice(0, input.queue.length - MOST_WAITING);
    trimQueue(input);
};

/**
 * Keeps what waits to run of a player under `MOST_QUEUED` of their time. A server running slower
 * than its players (a loop of its own that ticks a little late) would otherwise fall behind them
 * further every second; past it, the oldest steps go, what they pressed and let go carried to the
 * next, and the player's page is corrected to where the server has them.
 */
const trimQueue = (input: TPlayerInput): void => {
    let waiting = 0;
    for (const wire of input.queue) if (wire.e === 1) waiting += wire.d ?? 0;
    while (waiting > MOST_QUEUED && input.queue.length > 1 && input.queue[0].e === 1) {
        const gone = input.queue.shift()!;
        waiting -= gone.d ?? 0;
        const next = input.queue[0];
        if ((gone.p?.length ?? 0) > 0) next.p = [...new Set([...(next.p ?? []), ...gone.p!])];
        if ((gone.r?.length ?? 0) > 0) next.r = [...new Set([...(next.r ?? []), ...gone.r!])];
    }
};

/**
 * Forgets a player's actions: they left.
 *
 * @internal
 */
export const forgetInput = (share: TShareState, player: string): void => {
    share.inputs.delete(player);
};

/**
 * One of a player's steps, from the one before: what is pressed now, what went down and up, and
 * for how long each has been held. Only the game's own actions count: a name it does not have is
 * not kept, whoever sent it.
 */
const nextInput = (
    before: TInputState,
    values: Record<string, number>,
    pressed: Iterable<string>,
    released: Iterable<string>,
    dt: number,
    pressOf: (name: string) => number | undefined,
): TPlayerInput['state'] => {
    const known = (name: string) => pressOf(name) !== undefined;
    const kept: Record<string, number> = {};
    for (const [name, value] of Object.entries(values)) if (known(name)) kept[name] = value;
    const state = {
        values: kept,
        pressed: new Set([...pressed].filter(known)),
        released: new Set([...released].filter(known)),
        held: new Map<string, number>(),
    };
    for (const name of new Set([...before.held.keys(), ...Object.keys(kept), ...state.released])) {
        const press = pressOf(name) ?? DEFAULT_ACTION_PRESS;
        const down = (kept[name] ?? 0) >= press;
        const wasDown = (before.values[name] ?? 0) >= press;
        if (down) state.held.set(name, wasDown ? (before.held.get(name) ?? 0) + dt : 0);
        // Let go in this step: how long it was held can still be read, and is gone the step after.
        else if (state.released.has(name)) state.held.set(name, before.held.get(name) ?? 0);
    }
    return state;
};

/**
 * A player's actions for this step. One that sends only when something changes: everything that
 * came, at once, its moves run once with the server's step. One that sends every step: as many of
 * its steps as the time that went by pays for, each with how long it says it lasted, so a bunch
 * after a hiccup catches up and a game sending more than it should gets no further; nothing to run
 * while nothing comes (its steps are run when they do), the last actions still read by the updates
 * for a moment, then let go.
 */
const takeInput = (input: TPlayerInput, dt: number, pressOf: (name: string) => number | undefined): TRunStep[] => {
    const steps: TRunStep[] = [];
    let state: TPlayerInput['state'] = input.state;
    const pressed = new Set<string>();
    const released = new Set<string>();
    const changing = input.queue.length > 0 && input.queue[0].e === 0;
    if (changing) {
        for (const wire of input.queue.splice(0, input.queue.length)) {
            state = nextInput(state, wire.v, wire.p ?? [], wire.r ?? [], dt, pressOf);
            state.pressed.forEach((name) => pressed.add(name));
            state.released.forEach((name) => released.add(name));
            input.ack = wire.s;
            // Never earlier than before: a game cannot look further back just for one shot.
            input.view = Math.max(input.view ?? -Infinity, wire.t);
            input.stream = false;
        }
        input.owed = 0;
        input.starve = 0;
    } else {
        input.owed = Math.min(MOST_OWED, input.owed + dt);
        while (input.queue.length > 0 && input.queue[0].e === 1) {
            const wire = input.queue[0];
            const length = Math.min(LONGEST_STEP, Math.max(0, wire.d ?? dt));
            // A hair under, as the clocks never agree to the last digit.
            if (length > input.owed + 1e-6) break;
            input.queue.shift();
            input.owed -= length;
            input.starve = 0;
            input.stream = true;
            state = nextInput(state, wire.v, wire.p ?? [], wire.r ?? [], length, pressOf);
            // Back from a quiet that let go of it, and still held: pressed again.
            for (const name of input.dropped) {
                if ((state.values[name] ?? 0) >= (pressOf(name) ?? DEFAULT_ACTION_PRESS)) state.pressed.add(name);
            }
            input.dropped.clear();
            steps.push({ input: state, dt: length });
            state.pressed.forEach((name) => pressed.add(name));
            state.released.forEach((name) => released.add(name));
            input.ack = wire.s;
            // Never earlier than before: a game cannot look further back just for one shot.
            input.view = Math.max(input.view ?? -Infinity, wire.t);
        }
        if (steps.length === 0) {
            let values = state.values;
            const letGo: string[] = [];
            if (input.stream) {
                input.starve += dt;
                // Quiet too long: what was held is taken as let go.
                if (input.starve > STARVE_SECONDS) {
                    for (const [name, value] of Object.entries(values)) {
                        if (value >= (pressOf(name) ?? DEFAULT_ACTION_PRESS)) letGo.push(name);
                    }
                    letGo.forEach((name) => input.dropped.add(name));
                    values = {};
                }
            }
            state = nextInput(state, values, [], letGo, dt, pressOf);
            letGo.forEach((name) => released.add(name));
        }
    }
    // What the step's updates read: where the last of it left things, with every press in between.
    input.state = { ...state, pressed, released };
    if (input.stream) return steps;
    return [{ input: input.state, dt }];
};

/**
 * The actions of a player in the room, as the server has them in this step.
 *
 * @internal
 */
export const remoteActions = (share: TShareState, defsOf: () => readonly TActionDef[], player: string): TActionsHandle =>
    createInputHandle(defsOf, () => share.inputs.get(player)?.state ?? neutralInput());

/** What counts as pressed for an action of the game's map, or `undefined` for a name it does not have. */
const pressFrom = (defsOf: () => readonly TActionDef[]) => (name: string): number | undefined => {
    const def = defsOf().find((each) => each.name === name);
    return def === undefined ? undefined : def.press ?? DEFAULT_ACTION_PRESS;
};

/**
 * A step of the server: each player's actions for it, then the objects they move.
 *
 * @internal
 */
export const serverStep = (store: TRuntimeStore, side: TShareSide, defsOf: () => readonly TActionDef[], dt: number): void => {
    const share = side.share;
    share.clock += dt;
    const pressOf = pressFrom(defsOf);
    const steps = new Map<string, TRunStep[]>();
    for (const [player, input] of share.inputs) steps.set(player, takeInput(input, dt, pressOf));
    const here = new Set(side.players());
    for (const entry of [...share.entries.values()]) {
        if (entry.move === null || entry.owner === null || entry.gone || entry.box.destroyed || !here.has(entry.owner)) continue;
        // Once for each of the player's steps taken now: the server says it ran them, and the
        // player's page runs again only those after.
        for (const step of steps.get(entry.owner) ?? [{ input: neutralInput(), dt }]) {
            try {
                entry.move!(createInputHandle(defsOf, () => step.input), step.dt);
            } catch (error) {
                reportFrameError(store, error);
            }
        }
    }
};

/**
 * Writes what travels, saying once and leaving out a field that is not plain data.
 */
const json = (store: TRuntimeStore, share: TShareState, value: unknown, what: string): string | null => {
    try {
        return JSON.stringify(value) ?? 'null';
    } catch (error) {
        if (!share.toldJson) {
            share.toldJson = true;
            console.error(`[NacatamalOn] useShared: ${what} could not be written as JSON (${(error as Error).message}), and it was left out. Shared fields hold plain data: numbers, strings, booleans, arrays and objects of them.`, error);
        }
        void store;
        return null;
    }
};

/**
 * The end of a step of the server: what went is said gone, where everything is kept for `rewind`,
 * and, when it is time, every player is told what changed.
 *
 * @internal
 */
export const serverFinish = (store: TRuntimeStore, side: TShareSide): void => {
    const share = side.share;
    const t = share.clock;
    for (const [id, entry] of [...share.entries]) {
        if (entry.gone || entry.box.destroyed) {
            share.entries.delete(id);
            side.post(JSON.stringify({ k: 'gone', id } satisfies TServerWire));
            continue;
        }
        entry.history.push({ t, s: stateOf(entry.box) });
        while (entry.history.length > 1 && entry.history[0].t < t - LONGEST_REWIND) entry.history.shift();
    }
    share.sinceSend += 1;
    if (share.sinceSend < share.stepsPerSend) return;
    share.sinceSend = 0;

    const changes: string[] = [];
    for (const entry of share.entries.values()) {
        const entryText = changeOf(store, share, entry, entry.fresh || (entry.move !== null && entry.owner !== null));
        if (entryText !== null) changes.push(entryText);
        entry.fresh = false;
    }
    const body = `,"t":${t},"b":[${changes.join(',')}]}`;
    for (const player of side.players()) {
        const ack = share.inputs.get(player)?.ack ?? -1;
        side.post(`{"k":"snap","a":${ack}${body}`, player);
    }
};

/**
 * One object in a snapshot, or `null` when nothing of it changed. `whole` sends it all, as for one
 * just made, or one a player moves ahead and has to be corrected from.
 */
const changeOf = (store: TRuntimeStore, share: TShareState, entry: TSharedEntry, whole: boolean): string | null => {
    const state = stateOf(entry.box);
    const moved = whole || !sameState(state, entry.sentState);
    const fields: string[] = [];
    for (const [key, value] of Object.entries(entry.fields)) {
        const text = json(store, share, value, `the field '${key}' of '${entry.box.name}'`);
        if (text === null) continue;
        if (whole || entry.fresh || entry.sentFields.get(key) !== text) {
            entry.sentFields.set(key, text);
            fields.push(`${JSON.stringify(key)}:${text}`);
        }
    }
    // Taken out since they were last said: said gone, now and to whoever comes later.
    const removed: string[] = [];
    for (const key of [...entry.sentFields.keys()]) {
        if (Object.hasOwn(entry.fields, key)) continue;
        entry.sentFields.delete(key);
        entry.removedFields.add(key);
        removed.push(key);
    }
    for (const key of Object.keys(entry.fields)) entry.removedFields.delete(key);
    if (whole) for (const key of entry.removedFields) if (!removed.includes(key)) removed.push(key);
    if (!moved && fields.length === 0 && removed.length === 0) return null;
    entry.sentState = state;
    const gone = removed.length > 0 ? `,${JSON.stringify(removed)}` : '';
    return `[${JSON.stringify(entry.id)},${moved ? JSON.stringify(state) : 0},${fields.length > 0 ? `{${fields.join(',')}}` : 0}${gone}]`;
};

/**
 * The whole room for a player who just came: everything a spawner made, then where everything is.
 *
 * @internal
 */
export const welcomeShared = (store: TRuntimeStore, side: TShareSide, player: string): void => {
    const share = side.share;
    const changes: string[] = [];
    for (const entry of share.entries.values()) {
        if (entry.gone || entry.box.destroyed) continue;
        if (entry.kind !== null) {
            const spawn = spawnText(store, share, entry);
            if (spawn !== null) side.post(spawn, player);
        }
        const whole = changeOf(store, share, { ...entry, sentFields: new Map(entry.sentFields), removedFields: new Set(entry.removedFields) }, true);
        if (whole !== null) changes.push(whole);
    }
    side.post(`{"k":"snap","a":-1,"t":${share.clock},"b":[${changes.join(',')}]}`, player);
};

/** The words that make an object in a player's game. */
const spawnText = (store: TRuntimeStore, share: TShareState, entry: TSharedEntry): string | null => {
    const fields = json(store, share, entry.fields, `the fields of '${entry.box.name}'`);
    if (fields === null) return null;
    return `{"k":"spawn","id":${JSON.stringify(entry.id)},"kind":${JSON.stringify(entry.kind)},"a":${JSON.stringify(spawnArgs.get(entry) ?? [])},"s":${JSON.stringify(stateOf(entry.box))},"f":${fields},"o":${JSON.stringify(entry.owner)}}`;
};

/** What each spawned object was made with, said again to whoever comes later. */
const spawnArgs = new WeakMap<TSharedEntry, unknown[]>();

/**
 * Tells every player in the room of an object a spawner just made.
 *
 * @internal
 */
export const announceSpawn = (store: TRuntimeStore, side: TShareSide, entry: TSharedEntry, args: unknown[]): void => {
    spawnArgs.set(entry, args);
    const text = spawnText(store, side.share, entry);
    if (text !== null) side.post(text);
};

/**
 * Runs `fn` with every shared object put back where `player` saw it when they did what this step
 * runs, their own left where they are, then puts everything back.
 *
 * @internal
 */
export const rewindFor = <T>(side: TShareSide, player: string, fn: () => T): T => {
    const share = side.share;
    const now = share.clock;
    const view = share.inputs.get(player)?.view ?? now;
    // The server's own limit, not the player's word: a changed game saying it saw the world a
    // second ago would hit what was there a second ago.
    const t = Math.min(now, Math.max(now - Math.min(share.rewindLimit, LONGEST_REWIND), view));
    if (t >= now) return fn();
    const saved: Array<[TBox, number[] | null]> = [];
    for (const entry of share.entries.values()) {
        if (entry.owner === player || entry.gone || entry.box.destroyed || entry.box.transform === null) continue;
        const then = stateAt(entry.history, t);
        if (then === undefined || then === null) continue;
        saved.push([entry.box, stateOf(entry.box)]);
        applyState(entry.box, then);
    }
    try {
        return fn();
    } finally {
        for (const [box, state] of saved) applyState(box, state);
    }
};

// ---------------------------------------------------------------------------------------------
// A player's game
// ---------------------------------------------------------------------------------------------

/**
 * An object the server made: made here too, by the spawner of the same name, out of sight until the
 * server says where it is.
 *
 * @internal
 */
export const clientSpawn = (store: TRuntimeStore, side: TShareSide, wire: Extract<TServerWire, { k: 'spawn' }>): void => {
    const share = side.share;
    if (share.entries.has(wire.id)) return;
    const spawner = share.spawners.get(wire.kind);
    if (spawner === undefined || spawner.box.destroyed) {
        // Kept for the spawner of that name, which a scene still to come may have.
        const waiting = share.orphans.get(wire.kind) ?? [];
        if (!waiting.some((each) => each.id === wire.id)) waiting.push(wire);
        share.orphans.set(wire.kind, waiting);
        if (!share.toldKinds.has(wire.kind)) {
            share.toldKinds.add(wire.kind);
            console.warn(`[NacatamalOn] useNet: the server made a '${wire.kind}', and no scene here has useNetSpawn('${wire.kind}', …) yet, so it waits unseen until one does. The same scenes run on both sides: call useNetSpawn with that name in this game's scene too.`);
        }
        return;
    }
    // What the server said of it since it was made, newer than what came with the spawn: put on top
    // of it below, not under it.
    const since = share.pending.get(wire.id);
    share.pending.delete(wire.id);
    const before = share.spawning;
    share.spawning = { id: wire.id, kind: wire.kind, box: null, owner: wire.o };
    let box: TBox;
    try {
        box = spawner.spawn(...wire.a);
    } catch (error) {
        reportFrameError(store, error);
        return;
    } finally {
        share.spawning = before;
    }
    if (box.destroyed) return;
    const entry = share.byBox.get(box) ?? addShared(side, box, wire.id, { kind: wire.kind, owner: wire.o, move: null, smooth: true, fields: {} });
    entry.kind = wire.kind;
    entry.owner = wire.o;
    applyState(box, wire.s);
    Object.assign(entry.fields, wire.f);
    if (since !== undefined) {
        if (since.s !== undefined) {
            applyState(box, since.s);
            entry.samples.push({ t: share.lastSnap ?? 0, s: since.s });
        }
        applyFields(entry.fields, since.f, since.r);
    }
    if (entry.samples.length === 0) {
        entry.hidden = { visible: box.visible };
        box.visible = false;
    }
};

/**
 * An object the server ended: ended here too.
 *
 * @internal
 */
export const clientGone = (share: TShareState, id: string): void => {
    share.pending.delete(id);
    for (const [kind, waiting] of share.orphans) {
        const left = waiting.filter((wire) => wire.id !== id);
        if (left.length === 0) share.orphans.delete(kind);
        else share.orphans.set(kind, left);
    }
    const entry = share.entries.get(id);
    if (entry === undefined) return;
    share.entries.delete(id);
    destroy(entry.box);
};

/**
 * Where the server says everything is: kept to be shown a little later, or, for this player's own
 * object, kept to start again from.
 *
 * @internal
 */
export const clientSnap = (side: TShareSide, t: number, ack: number, changes: TSnapEntry[]): void => {
    const share = side.share;
    // The server's clock against this game's: the soonest answer is the truest, and the estimate
    // only drifts slowly towards a later one, so one slow message does not move everything.
    const seen = t - share.clock;
    if (share.offset === null || seen > share.offset) share.offset = seen;
    else share.offset += (seen - share.offset) * CLOCK_DRIFT;
    // How late this one came against the soonest: a lateness is taken at once, an early run slowly.
    const late = share.offset - seen;
    share.jitter = late > share.jitter ? late : share.jitter + (late - share.jitter) * CLOCK_DRIFT;
    if (share.adaptive) {
        // Enough to always have the next word from the server in hand: one send, and the lateness
        // the line shows. Grows quickly, shrinks slowly, so a good spell does not cut it too fine.
        const wanted = Math.min(MOST_INTERPOLATION, 1 / share.sendRate + 2 * share.jitter + INTERPOLATION_MARGIN);
        share.interpolation += (wanted - share.interpolation) * (wanted > share.interpolation ? 0.5 : CLOCK_DRIFT);
    }
    const previous = share.lastSnap;
    share.lastSnap = t;

    for (const [id, state, fields, removed] of changes) {
        const entry = share.entries.get(id);
        if (entry === undefined) {
            const waiting = share.pending.get(id) ?? { s: undefined, f: {} };
            if (state !== 0) waiting.s = state;
            if (fields !== 0) {
                Object.assign(waiting.f, fields);
                for (const key of Object.keys(fields)) waiting.r?.delete(key);
            }
            for (const key of removed ?? []) {
                delete waiting.f[key];
                (waiting.r ??= new Set()).add(key);
            }
            share.pending.set(id, waiting);
            continue;
        }
        if (entry.hidden !== null) {
            entry.box.visible = entry.hidden.visible;
            entry.hidden = null;
        }
        if (predicted(side, entry)) {
            entry.authority = { s: state === 0 ? stateOf(entry.box) : state, f: fields, r: removed, ack };
            continue;
        }
        if (!entry.smooth) {
            if (state !== 0) applyState(entry.box, state);
            applyFields(entry.fields, fields, removed);
            continue;
        }
        if (state !== 0) {
            // Not in the snapshot before this one means it had not moved by then: said so, or the
            // blend would start the move from the last time it did.
            const last = entry.samples.at(-1);
            if (last !== undefined && previous !== null && last.t < previous) entry.samples.push({ t: previous, s: last.s });
            entry.samples.push({ t, s: state });
            if (entry.samples.length === 1) applyState(entry.box, state);
        }
        if (fields !== 0 || (removed?.length ?? 0) > 0) entry.fieldQueue.push({ t, f: fields === 0 ? {} : fields, r: removed });
    }
};

/** The server's time this game shows the others at. */
const shownAt = (share: TShareState): number => share.shown ?? share.clock + (share.offset ?? 0) - share.interpolation;

/**
 * Moves on the server's time the others are shown at: by this step, leaning a little towards where
 * the estimate says it should be, or jumping there when it is far.
 */
const advanceShown = (share: TShareState, dt: number): void => {
    if (share.offset === null) return;
    const target = share.clock + share.offset - share.interpolation;
    if (share.shown === null || Math.abs(target - (share.shown + dt)) > JUMP) {
        share.shown = target;
        return;
    }
    share.shown += dt;
    share.shown += (target - share.shown) * CATCH_UP;
};

/**
 * What a player's game is doing now, as the numbers that travel.
 */
const readInput = (actions: TActionsHandle): TInputState => {
    const values: Record<string, number> = {};
    const pressed = new Set<string>();
    const released = new Set<string>();
    const held = new Map<string, number>();
    for (const name of actions.names) {
        const value = actions.rawValue(name);
        if (value > 0) values[name] = value;
        if (actions.justPressed(name)) pressed.add(name);
        if (actions.justReleased(name)) released.add(name);
        if (actions.isDown(name) || actions.justReleased(name)) held.set(name, actions.heldFor(name));
    }
    return { values, pressed, released, held };
};

/**
 * A step of a player's game: its own object put where the server last said and its unanswered steps
 * run again; this step's actions sent and run; everything else shown where the server had it a
 * moment ago.
 *
 * @internal
 */
export const clientStep = (store: TRuntimeStore, side: TShareSide, local: () => TActionsHandle, defsOf: () => readonly TActionDef[], dt: number): void => {
    const share = side.share;
    share.clock += dt;
    if (side.status !== 'online') return;
    advanceShown(share, dt);

    const own = [...share.entries.values()].filter((entry) => predicted(side, entry) && !entry.box.destroyed);

    // Started again from what the server decided, with what it has not run yet run once more.
    let answered = -Infinity;
    for (const entry of own) {
        if (entry.authority === null) continue;
        const { s, f, r, ack } = entry.authority;
        entry.authority = null;
        answered = Math.max(answered, ack);
        applyState(entry.box, s);
        applyFields(entry.fields, f, r);
        for (const step of share.unanswered) {
            if (step.seq <= ack) continue;
            run(store, entry, createInputHandle(defsOf, () => step.input), step.dt);
        }
    }
    if (answered > -Infinity) share.unanswered = share.unanswered.filter((step) => step.seq > answered);

    // This step's actions: every step while this game moves something ahead, else when they change.
    const input = readInput(local());
    const stream = own.length > 0;
    const values = JSON.stringify(input.values);
    // Said once when it stops coming every step, or the server would take the quiet that follows as
    // letting go of what is still held.
    const switched = stream !== share.streaming;
    share.streaming = stream;
    if (stream || switched || values !== share.lastSent || input.pressed.size > 0 || input.released.size > 0) {
        share.seq += 1;
        share.lastSent = values;
        const wire: TInputWire = { k: 'in', s: share.seq, t: shownAt(share), d: dt, e: stream ? 1 : 0, v: input.values };
        if (input.pressed.size > 0) wire.p = [...input.pressed];
        if (input.released.size > 0) wire.r = [...input.released];
        side.send(JSON.stringify(wire));
        if (stream) {
            share.unanswered.push({ seq: share.seq, input, dt });
            if (share.unanswered.length > MOST_UNANSWERED) share.unanswered.shift();
        }
    }
    for (const entry of own) run(store, entry, createInputHandle(defsOf, () => input), dt);

    // Everything else, where the server had it a moment ago.
    const at = shownAt(share);
    for (const entry of share.entries.values()) {
        if (entry.box.destroyed || predicted(side, entry)) continue;
        if (entry.smooth) {
            const samples = entry.samples;
            while (samples.length >= 2 && samples[1].t <= at) samples.shift();
            const a = samples[0];
            const b = samples[1];
            if (a !== undefined) {
                applyState(entry.box, b === undefined || at <= a.t ? a.s : blendState(a.s, b.s, (at - a.t) / (b.t - a.t)));
            }
        }
        while (entry.fieldQueue.length > 0 && entry.fieldQueue[0].t <= at) {
            const next = entry.fieldQueue.shift()!;
            applyFields(entry.fields, next.f, next.r);
        }
    }

    // Now and then, how long an answer takes.
    if (share.clock - share.lastPing >= PING_EVERY) {
        share.lastPing = share.clock;
        side.send(JSON.stringify({ k: 'ping', n: performance.now() }));
    }
};

/** Runs a player's own object one step, a mistake in it costing only its scene's update. */
const run = (store: TRuntimeStore, entry: TSharedEntry, input: TActionsHandle, dt: number): void => {
    try {
        entry.move!(input, dt);
    } catch (error) {
        reportFrameError(store, error);
    }
};

/**
 * The answer to a ping: how long the round took.
 *
 * @internal
 */
export const clientPong = (share: TShareState, sent: number): void => {
    share.ping = Math.max(0, (performance.now() - sent) / 1000);
};

/**
 * The line is gone: what the server made goes with it, and nothing of that room is kept.
 *
 * @internal
 */
export const clientOffline = (share: TShareState): void => {
    for (const [id, entry] of [...share.entries]) {
        entry.samples = [];
        entry.fieldQueue = [];
        entry.authority = null;
        if (entry.kind !== null) {
            share.entries.delete(id);
            destroy(entry.box);
        }
    }
    share.pending.clear();
    share.orphans.clear();
    share.streaming = false;
    share.unanswered = [];
    share.offset = null;
    share.shown = null;
    share.jitter = 0;
    share.lastSnap = null;
    share.lastSent = '';
    share.lastPing = -Infinity;
    share.ping = null;
};
