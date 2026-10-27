import { createGameSignal } from './create_game_signal';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';
import type { TGameSignal } from './types/t_game_signal';

/**
 * Each game's own, by name: what the engine tells a game through its handles (`game.onPaused`,
 * `game.onHidden`, `useScene().onPaused`), so two games on one page each hear only themselves.
 * Weak, so a game that is gone takes them with it.
 */
const moments = new WeakMap<TRuntimeStore, Map<string, TGameSignal<never>>>();

/**
 * The signal a game tells one moment through, made the first time it is asked for.
 *
 * @param name What it is, unique in the game: `'paused'`, `'page: hidden'`, `'scene paused: Level'`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gameMoment = <T = void>(store: TRuntimeStore, name: string): TGameSignal<T> => {
    let byName = moments.get(store);
    if (byName === undefined) {
        byName = new Map();
        moments.set(store, byName);
    }
    let found = byName.get(name) as TGameSignal<T> | undefined;
    if (found === undefined) {
        found = createGameSignal<T>();
        byName.set(name, found as TGameSignal<never>);
    }
    return found;
};

/**
 * Listens for one of a game's moments. With a box, the listener leaves with it, the way a pointer's
 * listeners do: a stopped scene or a destroyed object takes it along, so it never runs for
 * something that is gone.
 *
 * @returns What stops it sooner.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const onGameMoment = <T = void>(
    store: TRuntimeStore,
    name: string,
    box: TBox | null,
    listener: (event: T) => void,
): (() => void) => {
    const off = gameMoment<T>(store, name).connect(listener);
    box?.cleanups.push(off);
    return off;
};
