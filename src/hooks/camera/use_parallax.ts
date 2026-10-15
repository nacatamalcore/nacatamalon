import { getActiveBox } from '../../store';

/**
 * Makes this object, and everything it draws and holds, move with the camera only so much: `1` as
 * everything else, `0` not at all, as if pinned to the screen, and in between further away. A far
 * range of mountains is `{ x: 0.3, y: 0 }`: it slides slowly by and keeps its height.
 *
 * Only how it is drawn and where the pointer touches it change; its placement stays what it says.
 * Something it draws with a `parallax` of its own keeps that. It moves in whole pixels, as the
 * layers of the old consoles did.
 *
 * @param factor How much it moves with the camera, across and down.
 *
 * @example
 * ```ts
 * const Mountains = () => {
 *     useParallax({ x: 0.3, y: 0 });
 *     createSprite({ key: 'mountains', transform: { x: 240, y: 120 } });
 * };
 * ```
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useParallax = (factor: { x: number; y: number }): void => {
    const box = getActiveBox();
    if (box === null) {
        throw new Error('[NacatamalOn] useParallax: call it inside a scene body, or inside something created with useSpawn.');
    }
    box.parallax = { x: factor.x, y: factor.y };
};
