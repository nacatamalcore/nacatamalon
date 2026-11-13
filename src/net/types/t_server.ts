import type { TNetConnection } from './t_net_connection';
import type { TRoom, TRoomOptions } from './t_room';

/**
 * What a player asks for when they connect: a room, and what proves who they are.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNetAdmitRequest = {
    /** The room they want to enter. */
    room: string;
    /** What their game sent to prove who they are, or `null` when it sent nothing. */
    token: string | null;
};

/**
 * How a server is made: the game's options and scenes, which every room runs, and who gets in.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TServerOptions = Omit<TRoomOptions, 'name'> & {
    /**
     * Decides whether a player gets in: `true` lets them in with a name the room gives, a string lets
     * them in under that name (their account's, so they are the same player each time they come),
     * `false` refuses them. It may take its time (`async`, asking the game's own accounts). Left
     * out, everyone gets in.
     */
    admit?: (request: TNetAdmitRequest) => boolean | string | Promise<boolean | string>;
    /**
     * Which scene a room runs, by the room's name: `'pool'` runs `'Pool'`, and a name with no scene
     * is refused (`null`). Left out, every room runs the first scene, or `initialScene`.
     */
    roomScene?: (room: string) => string | null;
};

/**
 * A server: it takes connections, lets players in, and gives each room asked for a game of its
 * own, which ends when its last player leaves.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TServer = {
    /**
     * Takes one player's connection, however it came: from `listen`, from `connectLoopback`, or from
     * a server of someone else's wrapped as a {@link TNetConnection}. The player's game says which
     * room it wants, and is let in or refused.
     */
    accept(connection: TNetConnection): void;
    /**
     * Listens for players' WebSockets on a port, in Bun or in Node (20.16, 22.3 or newer), with
     * nothing to install. A page cannot open a port: there, `accept` the connections something else
     * hands over (`connectLoopback`, WebRTC).
     */
    listen(port: number): void;
    /** The rooms with players in them now, by name. */
    readonly rooms: readonly string[];
    /** A room by its name, while it has players in it. */
    room(name: string): TRoom | undefined;
    /** Ends every room and stops listening. */
    close(): void;
};
