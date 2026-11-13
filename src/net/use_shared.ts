import { getActiveBox, getActiveGame } from '../store';
import { outsideSceneBody } from '../utils/outside_scene_body';
import { netGameOf } from './net_game';
import { addShared } from './net_share';
import type { TShared, TSharedOptions } from './types/t_shared';

/**
 * Makes the object being built one every game in the room sees: the server decides where it is and
 * what its fields hold, and each player's game shows it there a moment later, gliding between what
 * it was told. Nothing in the scene's code sends anything: the room sends what changed, a few
 * dozen times a second, to everyone in it, and to whoever comes later.
 *
 * Two kinds of object, and only the first needs a `key`:
 *
 * - One every game builds itself, from the scene or its document (a door, a scoreboard): the same
 *   `key` on both sides is how they match.
 * - One the server makes while the game runs (a player's avatar, a bullet): made with a spawner of
 *   {@link useNetSpawn}, which makes it in every player's game too and names it for them.
 *
 * With an `owner` and a `move`, it is that player's own: the server moves it with what they press
 * (`useNet().actions`), and their own page moves it at once with the same code, ahead of the
 * server, and quietly takes the server's word when it comes. A player feels no wait for their own
 * character; the server still decides where it really is.
 *
 * Call it in the object's own body, once.
 *
 * @example
 * ```ts
 * import { createScene, createSprite, destroy, useSelf, type TGameObject, type TSceneFn } from 'nacatamalon';
 * import { useNet, useNetSpawn, useShared } from 'nacatamalon/net';
 *
 * const SPEED = 80;
 *
 * // A player's avatar: theirs to move, everyone's to see.
 * const Avatar = (player: string) => {
 *     const self = useSelf();
 *     createSprite({ texture: 'avatar' });
 *     const shared = useShared({
 *         owner: player,
 *         fields: { score: 0 },
 *         move: (input, dt) => {
 *             const { x, y } = input.direction('left', 'right', 'up', 'down');
 *             self.transform!.x += x * SPEED * dt;
 *             self.transform!.y += y * SPEED * dt;
 *         },
 *     });
 *     return shared;
 * };
 *
 * export const Arena: TSceneFn = () => {
 *     const net = useNet();
 *     const spawnAvatar = useNetSpawn('avatar', Avatar);
 *     if (net.role === 'server') {
 *         const avatars = new Map<string, TGameObject>();
 *         net.onJoin((player) => avatars.set(player, spawnAvatar(player)));
 *         net.onLeave((player) => {
 *             const avatar = avatars.get(player);
 *             if (avatar !== undefined) destroy(avatar);
 *         });
 *     }
 *     return createScene();
 * };
 * ```
 *
 * @param options Its key, its fields, its owner and what moves it, and whether it glides.
 * @returns The object as its code sees it: its id, its owner, whether it is this player's, and its fields.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useShared = <F extends Record<string, unknown> = Record<string, unknown>>(options: TSharedOptions<F> = {}): TShared<F> => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw outsideSceneBody('useShared');
    }
    if (options === null || typeof options !== 'object') {
        throw new Error(`[NacatamalOn] useShared: it takes its options in an object, as in { key: 'door' }, and got ${options === null ? 'null' : typeof options}.`);
    }
    const { key, owner = null, move, smooth = true } = options;
    if (owner !== null && (typeof owner !== 'string' || owner === '')) {
        throw new Error(`[NacatamalOn] useShared: owner is a player's name, as useNet().players has them, and got ${owner === '' ? 'an empty string' : typeof owner}.`);
    }
    if (move !== undefined && typeof move !== 'function') {
        throw new Error(`[NacatamalOn] useShared: move is a function, (input, dt) => { … }, and got ${typeof move}.`);
    }
    if (options.fields !== undefined && (options.fields === null || typeof options.fields !== 'object' || Array.isArray(options.fields))) {
        throw new Error('[NacatamalOn] useShared: fields go in an object of plain data, as in { hp: 3, name: \'Ana\' }.');
    }
    const game = netGameOf(store);
    const share = game.share;
    if (share.byBox.has(box)) {
        throw new Error(`[NacatamalOn] useShared: '${box.name}' is shared already. Call it once, in the object's own body.`);
    }

    // Made by a spawner of `useNetSpawn`: the id is the one the server gave it.
    const spawning = share.spawning;
    let id: string;
    let kind: string | null = null;
    let finalOwner = owner;
    if (spawning !== null && spawning.box === box) {
        id = spawning.id;
        kind = spawning.kind;
        // A player's game takes the server's word for whose it is.
        if (spawning.owner !== undefined) finalOwner = spawning.owner;
    } else {
        if (key === undefined) {
            throw new Error(`[NacatamalOn] useShared: '${box.name}' needs a key, the name both sides know it by, as in useShared({ key: 'door' }). An object the server makes while the game runs is made with a spawner of useNetSpawn instead, which names it.`);
        }
        if (typeof key !== 'string' || key === '' || key.startsWith('#')) {
            throw new Error(`[NacatamalOn] useShared: a key is a name, as in 'door', and got ${typeof key === 'string' ? `'${key}'` : typeof key}. Names that start with '#' are the server's own.`);
        }
        id = key;
    }

    const fields = structuredClone(options.fields ?? {}) as F;
    const entry = addShared(game.side, box, id, { kind, owner: finalOwner, move: move ?? null, smooth, fields });
    return {
        get id() { return entry.id; },
        get owner() { return entry.owner; },
        get mine() { return game.role === 'client' && entry.owner !== null && entry.owner === game.me; },
        get fields() { return entry.fields as F; },
    };
};
