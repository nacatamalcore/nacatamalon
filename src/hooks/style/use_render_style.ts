import { sceneOnly } from '../../game_systems/game_systems';
import { viewOf } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { styleScreenNow } from '../../style/sync_style_screen';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import type { TRenderStyle, TRenderStyleHandle } from '../../style';

/**
 * Draws this scene in a style: how its models' materials are drawn when they do not say (at every
 * pixel, swimming, shivering) and the full-screen effects it is seen through, in place of the game's
 * style (`createGame({ style })`). Leaving the scene takes it away and the game's comes back, its
 * effects included, so one level can be a 1997 console and the next a glossy studio.
 *
 * The view's, like `useFog`: a picture with a world of its own has its own, and asking for one inside
 * it does not change the room the picture is in. A picture is drawn with no full-screen effects, so
 * there a style changes its materials only: its `post` is for the screen. With none of its own, a
 * picture takes its scene's.
 *
 * Its resolution and filtering, when it has them, are the game's from the moment it is asked for, so
 * the rest of the scene is built at the size it is drawn at; behind a transition's cover, from the
 * swap. A material that says otherwise keeps what it says. The first time a scene draws a material at every
 * pixel it has not drawn that way before, its shader is made; until it is ready the model is drawn at
 * its corners, for a frame or two.
 *
 * @param style One of `RENDER.STYLES` (`cgi`, `ps1`), one of the game's own, or `null` for the game's.
 * @returns The scene's style, with `set` to change it while the game runs.
 *
 * @example
 * ```ts
 * const Museum = () => {
 *     const keys = useKeyboard();
 *     const style = useRenderStyle(RENDER.STYLES.cgi);
 *     useStudio();
 *     // ...
 *     useUpdate(() => {
 *         if (keys.justPressed('p')) style.set(RENDER.STYLES.ps1);
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useRenderStyle = (style: TRenderStyle | null): TRenderStyleHandle => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useRenderStyle');
    }
    sceneOnly('useRenderStyle');
    const view = viewOf(box);
    const store = getActiveGame();
    view.renderStyle = style;
    // Its resolution and smoothing at once, so the scene is built at the size it is drawn at.
    if (store !== null) styleScreenNow(store, view);
    return {
        get style() {
            return view.renderStyle;
        },
        set(next: TRenderStyle | null) {
            view.renderStyle = next;
            if (store !== null) styleScreenNow(store, view);
        },
    };
};
