import { registerScene } from '../scene/register_scene';
import { startScene } from '../scene/start_scene';
import { stopScene } from '../scene/stop_scene';
import { useCleanup } from '../hooks/scene/use_cleanup';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';
import { clearSplash, releaseGame, setSplash, splashOf } from './behind_splash';
import { createSplashScene } from './splash_scene';
import { launchesDue } from '../game_systems/game_systems';

/**
 * The splash's name among the game's scenes. Namespaced so it cannot collide with one of the game's.
 */
export const SPLASH_SCENE = 'nacatamalon:splash';

/**
 * Whether the game behind the splash can be shown: no change of its being covered, no launch of a
 * system's about to be made (which may come covered), and nothing any of its scenes or its systems
 * asked for still loading.
 */
const gameReady = (store: TRuntimeStore): boolean => {
    if (store.get('transition').active !== null || launchesDue(store)) {
        return false;
    }
    const loading = (root: TBox): boolean => root.loads.some((asset) => asset.status === 'loading');
    const splash = splashOf(store);
    const { scenes, systems } = store.get('world');
    return !scenes.some((scene) => scene !== splash && loading(scene)) && !systems.some(loading);
};

/**
 * Starts the game behind the splash: "Made with NacatamalOn" first, then the game.
 *
 * **The splash leaves the game alone.** The game's first scene is started as it would be without
 * one, and whatever the game does from there happens as it would without one too: the level and
 * the HUD a first scene launches, the scene a game system launches, a change covered by a
 * transition. It is only behind the splash (see `isBehindSplash`): not updated, not drawn, not
 * answering the pointer, its sounds and its `useSceneTransitionEnd` waiting, its transitions going
 * on without their cover being drawn.
 *
 * **Nor is the game kept waiting.** Its files load while the splash plays, and the splash waits for
 * them and for any change being covered, so on a game with a lot to load the splash is the loading
 * screen rather than time added on top. Then it sinks into its background, lets the game go, and
 * clears off it.
 *
 * @internal
 */
export const startWithSplash = (store: TRuntimeStore, initial: string, canvas: HTMLCanvasElement): void => {
    let splash: TBox | null = null;
    const splashScene = createSplashScene(canvas, {
        ready: () => gameReady(store),
        release: () => releaseGame(store),
        gone: () => {
            if (splash !== null) stopScene(store, splash);
        },
    });
    registerScene(store, SPLASH_SCENE, () => {
        // However it goes (its own way out, stopped by anything else, the game ending), the game is
        // let go of and the splash forgotten.
        useCleanup(() => {
            clearSplash(store);
            // Its scene stays registered for as long as the game runs, and would keep the splash's
            // whole tree alive through this.
            splash = null;
        });
        return splashScene();
    });
    splash = startScene(store, SPLASH_SCENE);
    setSplash(store, splash);
    try {
        startScene(store, initial);
    } catch (error) {
        // No game after all: nothing for the splash to wait for, nor to keep listening for.
        stopScene(store, splash);
        throw error;
    }
};
