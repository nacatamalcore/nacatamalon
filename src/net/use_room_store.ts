import { runtimeOfInstance } from '../game/handle/editor_handle_of';
import { getActiveBox, getActiveGame } from '../store';
import { outsideSceneBody } from '../utils/outside_scene_body';
import { netGameOf } from './net_game';
import { checkRoomStoreDecl, roomStoreHandle, roomStoreInstance } from './room_store';
import type { TGameInstance } from '../game/types/t_game_instance';
import type { TRoomStore, TRoomStoreDecl } from './types/t_room_store';

/**
 * This game's store of a declaration made with `createRoomStore`: the room's own in the room, a
 * copy the room keeps up to date in a player's game.
 *
 * Asked for while something is being built (a scene body, an object made with `useSpawn`, a game
 * system, `useReady`), where the engine knows which game it is; keep what it gives and use it
 * whenever, after an `await` too. What it watches goes with the object that asked.
 *
 * @example
 * ```ts
 * import { createScene } from 'nacatamalon';
 * import { createRoomStore, useRoomStore } from 'nacatamalon/net';
 *
 * const round = createRoomStore({ key: 'round', state: { number: 1, left: 90 } });
 *
 * const Arena = () => {
 *     const clock = useRoomStore(round);
 *     clock.watch((s) => s.left, (left) => { console.log(`${left} s left`); });
 *     return createScene();
 * };
 * ```
 * @param decl What `createRoomStore` declared.
 * @returns This game's store.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useRoomStore = <S extends Record<string, unknown>>(decl: TRoomStoreDecl<S>): TRoomStore<S> => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw outsideSceneBody('useRoomStore');
    }
    checkRoomStoreDecl('useRoomStore', decl);
    const game = netGameOf(store);
    const instance = roomStoreInstance(store, game, decl as unknown as TRoomStoreDecl<Record<string, unknown>>, 'useRoomStore');
    return roomStoreHandle<S>(store, game, instance, box);
};

/**
 * A game's store of a declaration, from outside the game: for a HUD of the page (React, the DOM)
 * over a game made with `createGame`. It waits for the game to start. What it watches stays until
 * the function `watch` returns is called.
 *
 * @example
 * ```ts
 * import { createGame } from 'nacatamalon';
 * import { createRoomStore, roomStoreOf } from 'nacatamalon/net';
 *
 * declare const container: HTMLElement;
 * declare const label: HTMLElement;
 * const score = createRoomStore({ key: 'score', state: { red: 0, blue: 0 } });
 *
 * const game = createGame(container, { width: 320, height: 180 })({});
 * const board = await roomStoreOf(game, score);
 * board.watch((s) => `${s.red} - ${s.blue}`, (text) => { label.textContent = text; });
 * ```
 * @param instance What `createGame` returned.
 * @param decl What `createRoomStore` declared.
 * @returns That game's store, once the game has started.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const roomStoreOf = async <S extends Record<string, unknown>>(instance: TGameInstance, decl: TRoomStoreDecl<S>): Promise<TRoomStore<S>> => {
    checkRoomStoreDecl('roomStoreOf', decl);
    const pending = runtimeOfInstance(instance);
    if (pending === undefined) {
        throw new Error('[NacatamalOn] roomStoreOf: that is not a game made with createGame. Inside the game, use useRoomStore; in the room\'s own code, room.store.');
    }
    const store = await pending;
    const game = netGameOf(store);
    const roomInstance = roomStoreInstance(store, game, decl as unknown as TRoomStoreDecl<Record<string, unknown>>, 'roomStoreOf');
    return roomStoreHandle<S>(store, game, roomInstance, null);
};
