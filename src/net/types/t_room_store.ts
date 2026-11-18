/**
 * What a room store holds, as everyone reads it: frozen all the way down, so a change made by hand
 * fails out loud instead of never reaching anyone.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRoomStoreValue<T> = T extends (infer U)[]
    ? readonly TRoomStoreValue<U>[]
    : T extends object
        ? { readonly [K in keyof T]: TRoomStoreValue<T[K]> }
        : T;

/**
 * How a room store is declared.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRoomStoreOptions<S extends Record<string, unknown>> = {
    /** Its name, one per game: two declarations with the same key in one game are a mistake. */
    key: string;
    /**
     * What each game's store starts with. Plain data only: numbers, strings, booleans, `null`,
     * arrays and objects of them, as it travels to the players as text.
     */
    state: S;
    /**
     * Whether it lives only in the room and never reaches the players: the rules, a count of
     * cheats, what is kept when the room ends. `false` by default.
     */
    serverOnly?: boolean;
};

/**
 * A room store as `createRoomStore` declares it: a plan, holding nothing of its own. Each game asks
 * for its own with `useRoomStore`, `room.store` or `roomStoreOf`.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRoomStoreDecl<S extends Record<string, unknown>> = {
    /** Its name. */
    readonly key: string;
    /** Whether it lives only in the room. */
    readonly serverOnly: boolean;
    /** What each game's store starts with, frozen. */
    readonly initial: TRoomStoreValue<S>;
};

/**
 * One game's room store: the room's own in the room, a copy that the room keeps up to date in each
 * player's game.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRoomStore<S extends Record<string, unknown>> = {
    /** Its name. */
    readonly key: string;
    /**
     * What it holds now, frozen. A getter: it is a new object after every change, so read it when
     * it is needed rather than keeping it.
     */
    readonly state: TRoomStoreValue<S>;
    /**
     * Whether this game may change it: in the room, and in a player's game that has never
     * connected (a game tried on its own, with no server). In a player's game that connected, the
     * server decides and this is `false`.
     */
    readonly writable: boolean;
    /**
     * Whether it holds what the room has: always in the room and in a game that never connected; in
     * a player's game, from the moment the stores of the room it is in arrive whole (just before
     * `onConnect`, so a watcher told of them already reads `true`) until it leaves that room, by the
     * line going or by `joinRoom`.
     */
    readonly ready: boolean;
    /**
     * Changes it: `change` gets a copy to change in place, and what it leaves is checked, frozen and
     * told to everyone watching (and, in the room, sent to the players before anything else the
     * room says). If `change` throws, nothing changes. Throws where `writable` is `false`.
     */
    set(change: (state: S) => void): void;
    /**
     * Calls `listener` whenever what `selector` picks out changes (`Object.is` unless `equals` says
     * otherwise; what did not change keeps its object, so picking an object works). Called inside
     * the change, once everything in it is done. From `useRoomStore` it goes with the object that
     * asked; elsewhere, call what it returns to stop.
     */
    watch<T>(
        selector: (state: TRoomStoreValue<S>) => T,
        listener: (value: T, previous: T) => void,
        equals?: (a: T, b: T) => boolean,
    ): () => void;
};
