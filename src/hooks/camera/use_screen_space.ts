import { getActiveBox } from '../../store';

/**
 * Keeps what is created here fixed on the screen, even while the scene's camera moves.
 *
 * It is how a health bar, a score or a pause button stays in its corner over a world that
 * scrolls. It covers everything this part of the scene creates and everything created under it,
 * however deep, so a whole HUD is marked once.
 *
 * Positions inside it are screen pixels, measured from the top-left corner, whatever the camera
 * is doing. Called in the body of a scene, the whole scene ignores its camera.
 *
 * The other way to get the same thing is a separate scene for the HUD, started with
 * `useScene().launch()`: a scene without a camera is always fixed to the screen, and it is drawn
 * over the scene that launched it.
 *
 * @param on `false` undoes it. Default `true`.
 *
 * @example
 * ```ts
 * const Hud = () => {
 *     useScreenSpace();
 *     createSprite({ tint: getColor('#4ade80'), width: 120, height: 8, transform: { x: 70, y: 16 } });
 * };
 *
 * export const Level: TSceneFn = () => {
 *     useCamera2d();
 *     useSpawn(Hud)();
 *     return createScene();
 * };
 * ```
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useScreenSpace = (on = true): void => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useScreenSpace: call it inside a scene body, not from a timer or a callback.');
    }
    box.screenSpace = on;
};
