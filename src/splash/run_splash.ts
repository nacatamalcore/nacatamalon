import { getColor } from '../color/get_color';
import { registerScene } from '../scene/register_scene';
import { startScene } from '../scene/start_scene';
import { stopScene } from '../scene/stop_scene';
import type { TBox } from '../box';
import type { TRuntimeStore } from '../store';
import { fade } from '../transition/builtin/fade';
import { canDrawTransition, startTransition } from '../transition/start_transition';
import { SPLASH_BACKGROUND, createSplashScene } from './splash_scene';

/**
 * The splash's name among the game's scenes. Namespaced so it cannot collide with one of the game's.
 */
export const SPLASH_SCENE = 'nacatamalon:splash';

/**
 * Starts the game behind the splash: "Made with NacatamalOn" first, then the game's first scene.
 *
 * **The game is not kept waiting.** Its first scene is built straight away and held, the same way a
 * scene change holds the scene coming in: it exists and its files are already loading, but it
 * neither updates nor draws nor answers the pointer. When the splash is over it fades into the game,
 * and the fade waits for those files, so on a game with a lot to load the splash is the loading
 * screen rather than time added on top.
 *
 * @internal
 */
export const startWithSplash = (store: TRuntimeStore, initial: string, canvas: HTMLCanvasElement): void => {
    const { width, height } = store.get('config');
    let splash: TBox | null = null;
    let game: TBox | null = null;

    const reveal = (): void => {
        if (splash === null || game === null) {
            return;
        }
        const transition = fade(500, getColor(SPLASH_BACKGROUND));
        // The game started a change of its own while it was being built, or the card cannot draw
        // the fade: the splash steps aside and the game is simply shown.
        if (store.get('transition').active !== null || !canDrawTransition(store, transition)) {
            game.held = false;
            stopScene(store, SPLASH_SCENE);
            return;
        }
        startTransition(store, transition, game, splash);
    };

    registerScene(store, SPLASH_SCENE, createSplashScene(width, height, canvas, reveal));
    splash = startScene(store, SPLASH_SCENE);
    game = startScene(store, initial);
    game.held = true;
};
