import { sceneOnly } from '../../game_systems/game_systems';
import { getActiveBox } from '../../store';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { countOverlay } from '../../post/count_overlays';

/**
 * Draws what is created here over the screen effects (`usePostProcess`, a project's `post`, a
 * style's), untouched by them: a HUD that a bloom does not make glow, a menu that the blur behind it
 * does not blur. It covers everything this part of the scene creates and everything created under
 * it, however deep; called in the body of a scene, the whole scene.
 *
 * **When, not where.** `useScreenSpace` says where a thing is placed; this says when it is drawn. A
 * HUD can be pinned without being an overlay, and then it goes through the effects as ever (a
 * palette, a CRT), and a thing of the world can be an overlay.
 *
 * **Over which effects.** All of them, unless the chain has an `{ overlay: true }` entry: then the
 * effects before it run under the overlay and the ones after it run over it too, so a HUD skips the
 * bloom and still goes through the CRT (`post: [bloom, { overlay: true }, crt]`).
 *
 * **Nothing changes its order on screen.** Only what is in front of everything that is not an overlay
 * is drawn over the effects: a thing with something in front of it (a glass, a sprite of the world,
 * the world of a scene started after) stays where it is, under them, and is said once; so does one
 * inside the filter or soft mask of something that is not an overlay, which draws what it holds as
 * one picture. A model drawn over the effects is still hidden by the models in front of it. A HUD
 * scene goes over a level when it is started after it (`useReady(() => scenes.launch('Hud'))`);
 * launched from the level's body it starts first, under it.
 *
 * **While a scene changes** it is drawn with everything else, under the effects and the cover, and is
 * back over them once the change is over: the cover stays first in the chain, where a crossing keeps
 * its picture of the scene going out. The same while the engine's splash fades out over the game.
 *
 * @param on `false` undoes it. Default `true`.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     // Started once the level is up, so the HUD goes over it.
 *     const scenes = useScene();
 *     useReady(() => scenes.launch('Hud'));
 *     return createScene();
 * };
 *
 * const Hud = () => {
 *     useScreenSpace();
 *     useOverlay();
 *     createText({ text: 'POINTING AT 17', transform: { x: 8, y: 8 } });
 *     return createScene();
 * };
 *
 * // The world, its bloom, the HUD, then a CRT over all of it.
 * createGame('#app', { post: [{ builtin: 'bloom' }, { overlay: true }, { builtin: 'crt' }] })({ Level, Hud });
 * ```
 *
 * @category Post-processing
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useOverlay = (on = true): void => {
    const box = getActiveBox();
    if (box === null) {
        throw outsideSceneBody('useOverlay');
    }
    sceneOnly('useOverlay');
    countOverlay(box, on);
    box.overlay = on;
};
