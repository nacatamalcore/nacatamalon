import type { TActionsHandle } from '../../input';
import type { TNetConnection } from './t_net_connection';

/**
 * Where a game runs in an online game: in a room of the server, where what happens is decided, or
 * in a player's page, which shows it and asks.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNetRole = 'server' | 'client';

/**
 * How a player's game is with its server: not connected, on its way (connected, waiting to be let
 * into the room), in the room, or with the line gone. A room of the server is always `'online'`.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNetStatus = 'offline' | 'connecting' | 'online' | 'closed';

/**
 * What a player's game says when it connects: which room it wants and what proves who it is. The
 * server's `admit` reads both.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNetConnectOptions = {
    /** The room to enter. Default `'main'`. */
    room?: string;
    /**
     * What the server checks before letting the player in: a session's token from the game's own
     * accounts, a name. The engine only carries it.
     */
    token?: string;
    /**
     * How far behind the server this game shows what the others do, in seconds: what the server
     * said is held back this long and shown gliding from one word to the next, so a late message
     * does not make anything jump. Left out, it follows the line: it starts at 0.1 and settles on one
     * of the server's sends and the lateness the line shows (about 0.04 on a good one, never over
     * 0.3). Given, it stays as given: less is fresher and shakier.
     */
    interpolation?: number;
};

/**
 * The network as a scene sees it, from `useNet()`. The same scenes run in the server's rooms and in
 * the players' pages, so the handle is the same in both, and `role` says which this is: what the
 * server decides (who won, how many coins) is done where `role` is `'server'`, and what only a
 * player has (the screen, the sound, the keys) where it is `'client'`.
 *
 * Everything that arrives (a message, a player coming or going) is handed over at the start of a
 * step, before any update, in the order it came: a scene never hears the network in the middle of a
 * frame. What a scene listens to stops when the scene leaves; each `on…` also returns what stops it
 * sooner.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNetHandle = {
    /** Where this game runs: in a room of the server, or in a player's page. */
    readonly role: TNetRole;
    /** How this game is with the server. A room of the server is always `'online'`. */
    readonly status: TNetStatus;
    /** The room this game is in, or `null` before a player's game has been let into one. */
    readonly room: string | null;
    /** This player's own name in the room, once let in. `null` on the server and before. */
    readonly me: string | null;
    /** The players in the room now, in the order they came, this one among them. */
    readonly players: readonly string[];
    /**
     * How long a word takes to go to the server and back, in seconds, measured every second while
     * online: `null` before the first answer, and always on the server.
     */
    readonly ping: number | null;

    /**
     * Listens to the messages of one type. On the server, `from` is the player who sent it; in a
     * player's game every message comes from the server and `from` is `null`.
     *
     * A message says what someone did, never what they get: the server decides that. See the
     * example in {@link useNet}.
     */
    onMessage<T = unknown>(type: string, listener: (data: T, from: string | null) => void): () => void;
    /**
     * Listens to players coming into the room. In a player's game it is also told, on arriving,
     * every player already there and this one, so a scene that makes an avatar for each player who
     * joins makes all of them.
     */
    onJoin(listener: (player: string) => void): () => void;
    /** Listens to players leaving the room, whatever the reason: they left, the line went, they were sent away. */
    onLeave(listener: (player: string) => void): () => void;

    /**
     * Connects a player's game to its server and asks to enter a room. `to` is the server's address
     * (`'wss://example.com'`, through a WebSocket) or a connection made any other way
     * (`connectLoopback`, socket.io wrapped as a {@link TNetConnection}). Connecting again leaves
     * the room it was in first. A player's game only.
     */
    connect(to: string | TNetConnection, options?: TNetConnectOptions): void;
    /** Leaves the room and ends the line. A player's game only. */
    disconnect(): void;
    /**
     * Sends the server a message of a type, with what it carries. A player's game only. Sent after
     * the line has gone and before the scenes hear so (`onDisconnect`, at the next step), it is lost,
     * as on a line that dropped; sent before ever connecting, it throws.
     */
    send(type: string, data?: unknown): void;
    /** Listens to this game being let into its room: `me`, `room` and `players` are there now. */
    onConnect(listener: () => void): () => void;
    /** Listens to the line going, or the server refusing the player, with why. */
    onDisconnect(listener: (reason: string) => void): () => void;

    /** Sends one player a message of a type, with what it carries. The server only. */
    sendTo(player: string, type: string, data?: unknown): void;
    /** Sends every player in the room a message, leaving out `except` when given. The server only. */
    broadcast(type: string, data?: unknown, options?: { except?: string }): void;
    /** Sends a player out of the room and ends their line, telling them why. The server only. */
    kick(player: string, reason?: string): void;
    /**
     * A player's actions, as their game read them, in this step: the same handle `useActions` gives
     * a scene, filled from the player's machine. The server only, and for the server's updates:
     * whether they fired, jumped or opened the door is decided here, from what they pressed.
     *
     * A player's game sends its actions on its own: when they change, and every step while it
     * moves an object of its own (`useShared` with `move`). `pressedAt` has no moment to give.
     */
    actions(player: string): TActionsHandle;
    /**
     * Runs `fn` with every shared object back where `player` saw it when they did what this step
     * runs, then puts everything back: a player who shot at what they saw hits it, although by the
     * time the shot arrives it has moved on. Their own objects stay where they are. Never further
     * back than the room's `rewindLimit` (0.25 s unless it says), and never earlier than what the
     * player said they saw before: a changed game cannot pick how far back its shots look. The
     * server only.
     *
     * Only placements go back: what reads them in `fn` (distances, `worldPlacementOf`) sees the
     * past; a physics world does not.
     */
    rewind<T>(player: string, fn: () => T): T;
};
