import { markMadeBy } from '../box/made_by';
import { useSpawn } from '../hooks/spawn/use_spawn';
import { useTransform } from '../hooks/transform/use_transform';
import { getActiveBox, getActiveGame } from '../store';
import { outsideSceneBody } from '../utils/outside_scene_body';
import { netGameOf, queueNet } from './net_game';
import { addShared, announceSpawn } from './net_share';
import type { TGameObject, TSpawnOptions } from '../hooks/spawn/use_spawn';

/**
 * A spawner for objects every game in the room sees: the server calls it, and the object is made
 * there and, with the same arguments, in every player's game, now and for whoever comes later; when
 * the server destroys it, it goes everywhere. One whose body gave it no placement gets one, at the
 * origin of its parent. Where it is and its fields travel on their own (see
 * {@link useShared}, which its body may call to say more: its fields, its owner, what moves it).
 *
 * The scenes are the same on both sides, so both call this, with the same name: the name is how a
 * player's game knows which spawner the server used. Only the server makes anything with it; a
 * player's game that wants one asks the server with a message, and the server decides.
 *
 * The arguments travel, so they are plain data: a player's name, a colour, a number.
 *
 * @example
 * ```ts
 * import { createScene, createShapes, destroy, useTransform, type TGameObject, type TSceneFn } from 'nacatamalon';
 * import { useNet, useNetSpawn } from 'nacatamalon/net';
 *
 * const Coin = (x: number, y: number) => {
 *     useTransform({ x, y });
 *     createShapes({ shapes: [{ type: 'circle', x: 0, y: 0, radius: 4, fill: '#ffd040' }] });
 * };
 *
 * export const Field: TSceneFn = () => {
 *     const net = useNet();
 *     const spawnCoin = useNetSpawn('coin', Coin);
 *     if (net.role === 'server') {
 *         const coin: TGameObject = spawnCoin(40, 30);
 *         net.onMessage('take', () => destroy(coin));
 *     }
 *     return createScene();
 * };
 * ```
 *
 * @param kind The name both sides know the spawner by: one per kind of object in the game.
 * @param component The object's body, as `useSpawn` takes it.
 * @param options Where it goes (`parent`) and its tags, as for `useSpawn`.
 * @returns What the server calls to make one: the same object `useSpawn` would give.
 *
 * @experimental
 * @category Net
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useNetSpawn = <TArgs extends unknown[], TApi>(
    kind: string,
    component: (...args: TArgs) => TApi,
    options: Omit<TSpawnOptions, 'name'> = {},
): ((...args: TArgs) => TGameObject<TApi>) => {
    const store = getActiveGame();
    const owner = getActiveBox();
    if (store === null || owner === null) {
        throw outsideSceneBody('useNetSpawn');
    }
    if (typeof kind !== 'string' || kind === '') {
        throw new Error(`[NacatamalOn] useNetSpawn: the first thing it takes is the name both sides know the spawner by, as in 'avatar', and got ${kind === '' ? 'an empty string' : typeof kind}.`);
    }
    if (typeof component !== 'function') {
        throw new Error(`[NacatamalOn] useNetSpawn: '${kind}' needs the object's body, a function, and got ${typeof component}.`);
    }
    const game = netGameOf(store);
    const share = game.share;

    const spawn = useSpawn((...args: TArgs): TApi => {
        const self = getActiveBox();
        if (self !== null) {
            // Seen as the game's own component, not as this wrapper, by whoever asks what made it.
            markMadeBy(self, component);
            // The object of the spawn going on now, so its `useShared` takes the server's id.
            if (share.spawning !== null && share.spawning.box === null) share.spawning.box = self;
        }
        const api = component(...args);
        // Somewhere to be, for where it is to travel: after the body, so a body that placed it
        // itself (`useTransform({ x, y })`) keeps where it put it.
        if (self !== null && self.transform === null) useTransform();
        return api;
    }, { ...options, name: component.name.length > 0 ? component.name : kind });

    share.spawners.set(kind, { spawn: spawn as (...args: unknown[]) => TGameObject, box: owner });
    // What the server made before this spawner was there, made at the start of the next step, from
    // what is still waiting then (a line changed or an object gone in between is not made).
    if (game.role === 'client' && share.orphans.has(kind)) {
        queueNet(game, { kind: 'replay', line: game.lineCount, of: kind });
    }
    owner.cleanups.push(() => {
        if (share.spawners.get(kind)?.box === owner) share.spawners.delete(kind);
    });

    return (...args: TArgs): TGameObject<TApi> => {
        if (game.role !== 'server') {
            throw new Error(`[NacatamalOn] useNetSpawn: '${kind}' was asked for in a player's game, and only the server makes shared objects: it makes them here too. Ask the server with useNet().send, and let it decide; check useNet().role first in code both run.`);
        }
        let copy: unknown[];
        try {
            copy = JSON.parse(JSON.stringify(args)) as unknown[];
        } catch (error) {
            throw new Error(`[NacatamalOn] useNetSpawn: '${kind}' was given something that cannot travel (${(error as Error).message}). Its arguments go to every player: plain data only, as a name, a colour or a number.`);
        }
        share.nextId += 1;
        const id = `#${share.nextId}`;
        const before = share.spawning;
        share.spawning = { id, kind, box: null, owner: undefined };
        let made: TGameObject<TApi>;
        try {
            made = spawn(...args);
        } finally {
            share.spawning = before;
        }
        if (made.destroyed) return made;
        const entry = share.byBox.get(made) ?? addShared(game.side, made, id, { kind, owner: null, move: null, smooth: true, fields: {} });
        announceSpawn(store, game.side, entry, copy);
        return made;
    };
};
