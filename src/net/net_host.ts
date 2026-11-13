import type { TNetConnection } from './types/t_net_connection';

/**
 * Where an online game's lines go when a tool runs its server and its players itself, in one page
 * or one machine: an editor showing the server and three players side by side. The game's own code
 * is the one it ships with (`server.listen(8080)`, `useNet().connect('wss://…')`), and the tool
 * hands each line to the other end without a port being opened.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNetHost = {
    /**
     * Takes the place of `listen(port)`: from now on, `accept` is given each connection that comes
     * for this server. Returns what stops listening.
     */
    listen(port: number, accept: (connection: TNetConnection) => void): () => void;
    /**
     * Takes the place of the WebSocket `useNet().connect(address)` would open: the connection to
     * that server, or `null` to let the game open its WebSocket as usual.
     */
    connect(address: string): TNetConnection | null;
};

/**
 * Kept on the page's global object rather than in this module: a page that has the engine twice
 * (a tool's copy and the game's) still has one host.
 */
const KEY = Symbol.for('nacatamalon.net.host');

/**
 * Hands every online game in this page to a host of the tool's: what `listen(port)` and
 * `useNet().connect(address)` do from now on goes through it. `null` gives them back.
 *
 * A shipped game never calls it: its server listens on a real port and its players open a real
 * WebSocket. An editor calls it in the pages where it runs a game's server and players together,
 * before the game's code starts.
 *
 * @example
 * ```ts
 * import { setNetHost } from 'nacatamalon/authoring';
 * import type { TNetConnection } from 'nacatamalon/net';
 *
 * // A tool that knows how to reach the server it runs, in another frame of the same page.
 * declare const reachServer: () => TNetConnection;
 * declare const takePlayers: (accept: (connection: TNetConnection) => void) => () => void;
 *
 * setNetHost({
 *     listen: (_port, accept) => takePlayers(accept),
 *     connect: () => reachServer(),
 * });
 * ```
 *
 * @param host Where the lines go, or `null` for the real ports again.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setNetHost = (host: TNetHost | null): void => {
    if (host !== null && (typeof host !== 'object' || typeof host.listen !== 'function' || typeof host.connect !== 'function')) {
        throw new Error('[NacatamalOn] setNetHost: it takes a host with listen(port, accept) and connect(address), or null.');
    }
    (globalThis as Record<symbol, unknown>)[KEY] = host ?? undefined;
};

/**
 * The host of the tool running this page's online games, if any.
 *
 * @internal
 */
export const netHost = (): TNetHost | null => ((globalThis as Record<symbol, unknown>)[KEY] as TNetHost | undefined) ?? null;
