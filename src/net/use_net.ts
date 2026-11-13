import { getActiveBox, getActiveGame } from '../store';
import { outsideSceneBody } from '../utils/outside_scene_body';
import { createNetHandle, netGameOf } from './net_game';
import type { TNetHandle } from './types/t_net_handle';

/**
 * The network, for a scene of an online game. The same scenes run in two places: in a room of the
 * server, where what happens is decided, and in each player's page, which shows it and asks. The
 * handle is the same in both, and `role` says which this is.
 *
 * The rule that keeps a game fair: **a player's game says what the player did, and the server
 * decides what comes of it.** It sends "I cast the line" and "I pulled", never "I caught a fish" or
 * "I have 110 coins": the server, running the same scene, works out whether a fish bit, adds the
 * coins and tells everyone. A player who changes their own game only changes their own screen.
 *
 * Everything that arrives is handed over at the start of a step, before any update, in order. What a
 * scene listens to stops when the scene leaves.
 *
 * @example
 * ```ts
 * import { createScene, createText, useUpdate, useKeyboard, type TSceneFn } from 'nacatamalon';
 * import { useRandom } from 'nacatamalon/math';
 * import { useNet } from 'nacatamalon/net';
 *
 * export const Pond: TSceneFn = () => {
 *     const net = useNet();
 *     const random = useRandom();
 *     const coins = new Map<string, number>();
 *
 *     if (net.role === 'server') {
 *         // Decided here and nowhere else, with the server's own luck.
 *         net.onJoin((player) => coins.set(player, 100));
 *         net.onMessage('pull', (_data, from) => {
 *             if (from === null || !random.chance(0.5)) return; // nothing bit
 *             const now = (coins.get(from) ?? 0) + 10;
 *             coins.set(from, now);
 *             net.sendTo(from, 'coins', now);
 *         });
 *     } else {
 *         const label = createText({ text: 'COINS 100' });
 *         const keys = useKeyboard();
 *         net.connect('wss://example.com', { room: 'pond' });
 *         net.onMessage<number>('coins', (amount) => { label.text = `COINS ${amount}`; });
 *         useUpdate(() => {
 *             if (net.status === 'online' && keys.justPressed(' ')) net.send('pull');
 *         });
 *     }
 *     return createScene();
 * };
 * ```
 *
 * @returns The network as this scene sees it: who it is, who is in the room, and what to send.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useNet = (): TNetHandle => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw outsideSceneBody('useNet');
    }
    return createNetHandle(store, netGameOf(store), box);
};
