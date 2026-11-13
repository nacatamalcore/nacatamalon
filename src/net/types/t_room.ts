import type { THeadlessGameOptions } from '../../headless/types';
import type { TGameObject } from '../../hooks';
import type { TNetConnection } from './t_net_connection';

/**
 * How a room is made: the game's own options and scenes, as a player's page has them, and how it
 * keeps time. `assets` is where the files are read from when the room runs in Bun or Node (default
 * `'public'`); in a page they come from the page's own address, as the players' do.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRoomOptions = Omit<THeadlessGameOptions, 'step'> & {
    /** What the room is called: what a player asks for, and what `useNet().room` says. Default `'main'`. */
    name?: string;
    /**
     * Steps a second: the room always moves in steps of exactly `1 / step` seconds, whatever the
     * machine, so what it decides is the same every time. 20 is plenty for walking around a room and
     * chatting; a game of quick reactions wants 60. Default `60`.
     */
    step?: number;
    /**
     * Whether the room keeps its own time, running its steps as the seconds go by. Default `true`.
     * `false` when something else keeps it (another server's loop, a test): it moves only when
     * `step()` is called.
     */
    clock?: boolean;
    /**
     * How many times a second the room tells its players where the shared objects are (`useShared`)
     * and what their fields hold: at most `step`, and then only what changed. More is smoother and
     * costs more of the line. Default `step` up to 30.
     */
    sendRate?: number;
    /**
     * How far back `useNet().rewind` may look, in seconds: a player's shot is judged where they
     * saw the others, but never further back than this, whatever their game says it saw. Covers a
     * player's ping and their interpolation; past it, a slow player hits a little behind. Default
     * 0.25 (about 200 ms of ping), at most 1.
     */
    rewindLimit?: number;
};

/**
 * One room: the game's own scenes running with no screen and no sound, deciding what happens, with
 * the players in it. What `createServer` makes for each room asked for, and what a server of
 * someone else's (socket.io, or a framework with rooms of its own) holds itself through `createRoom`.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TRoom = {
    /** What the room is called. */
    readonly name: string;
    /** The players in it now, in the order they came. */
    readonly players: readonly string[];
    /** Steps run so far. */
    readonly frame: number;
    /**
     * Lets a player in, over their connection, and tells them they are in. The room's scenes hear it
     * (`onJoin`) at the start of the next step. `player` is the name they go by in the room, unique
     * in it; left out, the room gives one. A name already in the room takes over from whoever had it,
     * who is sent out: the same player connecting again from another tab.
     *
     * @returns The name the player goes by.
     */
    join(connection: TNetConnection, player?: string): string;
    /** Sends a player out, ending their line and telling them why. Nothing if they are not in the room. */
    leave(player: string, reason?: string): void;
    /** Runs `frames` steps (one when left out). For a room that does not keep its own time. */
    step(frames?: number): void;
    /** The first object of that name in the room's scenes, or `undefined`: to look at what it decided. */
    find(name: string): TGameObject | undefined;
    /** Every object of that name in the room's scenes. */
    findAll(name: string): TGameObject[];
    /** Waits until everything the scenes are loading has arrived, up to `timeout` seconds (default 5). */
    loaded(timeout?: number): Promise<void>;
    /**
     * Ends the room: every player is sent out, the scenes hear everything still on its way (the
     * players leaving among it, so `onLeave` can keep what each one won), and every scene's cleanups
     * run.
     */
    destroy(): void;
};
