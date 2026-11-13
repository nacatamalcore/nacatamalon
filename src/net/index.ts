/**
 * Online games: the same scenes running in a room of a server, where what happens is decided, and in
 * each player's page, which shows it and asks.
 *
 * - `useNet()` is the network as a scene sees it, the same in both places: `role` says which.
 * - `useShared` makes an object one every game in the room sees, moved by the server (and, for a
 *   player's own, by that player ahead of it); `useNetSpawn` makes such objects while the game runs.
 * - `createServer` takes players' connections and gives each room a game of its own; `createRoom` is
 *   one room, for a server of someone else's that holds them itself.
 * - A connection is anything that carries text both ways (`TNetConnection`): a WebSocket
 *   (`webSocketConnection`, or just an address), socket.io or WebRTC wrapped in four functions, or
 *   `connectLoopback`, a line in memory to a server in the same page.
 *
 * A door of its own so a game that is never online carries none of it. Nothing here needs a
 * package: the WebSocket is the one the page, Bun and Node already have.
 *
 * Experimental: online play is new, and what is here can change from one version to the next before
 * it is kept as it is.
 *
 * @experimental
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export { useNet } from './use_net';
export { useShared } from './use_shared';
export { useNetSpawn } from './use_net_spawn';
export { createServer } from './create_server';
export { createRoom } from './create_room';
export { connectLoopback } from './connect_loopback';
export { webSocketConnection } from './web_socket_connection';
export type { TLoopbackOptions } from './connect_loopback';
export type { TNetConnection } from './types/t_net_connection';
export type { TShared, TSharedMove, TSharedOptions } from './types/t_shared';
export type { TNetConnectOptions, TNetHandle, TNetRole, TNetStatus } from './types/t_net_handle';
export type { TRoom, TRoomOptions } from './types/t_room';
export type { TNetAdmitRequest, TServer, TServerOptions } from './types/t_server';
