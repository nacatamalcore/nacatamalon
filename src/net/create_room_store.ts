import { checkPlain, deepFreeze } from './room_store';
import type { TRoomStoreDecl, TRoomStoreOptions, TRoomStoreValue } from './types/t_room_store';

/**
 * Declares a room store: data of one room (its score, its round, whose turn it is) that the room
 * changes and every player in it sees, a moment later, read only.
 *
 * A store of the game (`createGameStore`) is one object for everything that imports it: in a
 * server with many rooms, one for all of them, so a goal in one room would score in every room.
 * This one is a plan, holding nothing: each game has its own, asked for with `useRoomStore` while
 * something is being built (a scene, an object, a game system), `room.store` from the server's own
 * code, or `roomStoreOf` from a page's HUD. The room's is the one that is changed; in a player's
 * page it is a copy the room keeps up to date, changed before anything the room says after the
 * change. A game tried on its own, never connected, has one of its own to change, as the room
 * would.
 *
 * @example
 * ```ts
 * import { createScene, createText } from 'nacatamalon';
 * import { createRoomStore, useNet, useRoomStore } from 'nacatamalon/net';
 *
 * // stores/score.ts
 * export const score = createRoomStore({ key: 'score', state: { red: 0, blue: 0 } });
 *
 * // scenes/match.ts
 * const Match = () => {
 *     const net = useNet();
 *     const board = useRoomStore(score);
 *     const label = createText({ text: '0 - 0' });
 *     board.watch((s) => `${s.red} - ${s.blue}`, (text) => { label.text = text; });
 *     if (board.writable) {
 *         net.onMessage<'red' | 'blue'>('goal', (team) => board.set((s) => { s[team] += 1; }));
 *     }
 *     return createScene();
 * };
 * ```
 * @param options Its `key`, what each game's starts with (`state`) and whether it stays in the
 * room (`serverOnly`).
 * @returns The declaration, to import wherever it is used.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createRoomStore = <S extends Record<string, unknown>>(options: TRoomStoreOptions<S>): TRoomStoreDecl<S> => {
    if (options === null || typeof options !== 'object') {
        throw new Error('[NacatamalOn] createRoomStore: it takes { key, state }, as in createRoomStore({ key: \'score\', state: { red: 0, blue: 0 } }).');
    }
    const { key, state, serverOnly = false } = options;
    if (typeof key !== 'string' || key === '') {
        throw new Error(`[NacatamalOn] createRoomStore: key is the store's name, as in 'score', and got ${key === '' ? 'an empty string' : typeof key}.`);
    }
    if (state === null || typeof state !== 'object' || Array.isArray(state)) {
        throw new Error(`[NacatamalOn] createRoomStore: the state of '${key}' is an object of plain data, as in { red: 0, blue: 0 }, and got ${Array.isArray(state) ? 'an array' : state === null ? 'null' : typeof state}.`);
    }
    if (typeof serverOnly !== 'boolean') {
        throw new Error(`[NacatamalOn] createRoomStore: serverOnly of '${key}' is true or false, and got ${typeof serverOnly}.`);
    }
    checkPlain(`createRoomStore '${key}'`, state, key);
    return Object.freeze({
        key,
        serverOnly,
        // A copy: the object given stays the caller's, and nothing done to it reaches a game.
        initial: deepFreeze(structuredClone(state)) as TRoomStoreValue<S>,
    });
};
