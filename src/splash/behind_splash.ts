import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';

/**
 * The splash's name among the game's scenes. Namespaced so it cannot collide with one of the game's.
 * Here, with what the loop asks of the splash, so a tool listing the game's scenes can leave it out
 * without loading the splash.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const SPLASH_SCENE = 'nacatamalon:splash';

/**
 * The splash each game is showing: its scene, and whether it has let the game go yet.
 *
 * Kept apart from the splash itself, which is only loaded by a game that shows it: the loop, the
 * pointer and the drawing ask this on every frame, and must not pull the splash in to do it.
 */
const splashes = new WeakMap<TRuntimeStore, { box: TBox | null; released: boolean }>();

/**
 * Says that `store` opens with its splash, before anything of the game starts: its systems first,
 * whose sounds would otherwise start over it. Until `setSplash` names its scene, every scene and
 * system of the game is behind it.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const expectSplash = (store: TRuntimeStore): void => {
    if (!splashes.has(store)) {
        splashes.set(store, { box: null, released: false });
    }
};

/**
 * Says that `box`, a running scene, is the splash of `store`: until `releaseGame`, every other scene
 * of that game is behind it (see `isBehindSplash`).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const setSplash = (store: TRuntimeStore, box: TBox): void => {
    splashes.set(store, { box, released: false });
};

/**
 * The splash lets the game go: it is no longer behind it, though the splash is still drawn over it,
 * on its way out, until `clearSplash`.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const releaseGame = (store: TRuntimeStore): void => {
    const splash = splashes.get(store);
    if (splash !== undefined) {
        splash.released = true;
    }
};

/**
 * The splash is gone: stopped, by its own fade or by anything else, or the game has ended.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const clearSplash = (store: TRuntimeStore): void => {
    splashes.delete(store);
};

/**
 * The scene of the splash `store` is showing, let go of the game or not, or `null`. Drawn over
 * every other scene, and stepped on its own, on real time, rather than with the game.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const splashOf = (store: TRuntimeStore): TBox | null => splashes.get(store)?.box ?? null;

/**
 * Whether the game is behind its splash now: started, building and loading, but not yet let go.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const gameBehindSplash = (store: TRuntimeStore): boolean => {
    const splash = splashes.get(store);
    return splash !== undefined && !splash.released;
};

/**
 * Whether `scene`, a scene of `store` (running, held or being built), is behind the splash: every
 * scene but the splash's own, until the splash lets the game go.
 *
 * Behind it, a scene goes on as it would without a splash (its body, its `useReady`, the scene
 * changes it asks for, covered ones included), but it is not updated, drawn or answered, and what
 * waits for it to be seen (a sound set to start on its own, `useSceneTransitionEnd`) waits on. What
 * a scene held behind a transition is spared, for the same reason: nobody sees it yet.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const isBehindSplash = (store: TRuntimeStore, scene: TBox): boolean => {
    const splash = splashes.get(store);
    return splash !== undefined && !splash.released && splash.box !== scene;
};
