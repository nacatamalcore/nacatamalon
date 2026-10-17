import { getActiveGame } from '../../store';
import { takePhoto } from '../../capture';
import type { TCapture } from '../../capture';

/**
 * A camera for the game itself: takes photos of what the player sees, the whole screen or a part of
 * it, for a photography game, an album, a "spot the difference", a sticker of the boss beaten. Call it
 * in a scene's body or a behaviour's, and take a photo at any moment after (it resolves the next
 * frame, drawn once more for it, so it is for taking a picture, not for every frame).
 *
 * A photo is pixels, plus what came out in it (`boxes`): each box shown in the frame, how much of it
 * (`seen`, 0 to 1) and where, for scoring what the player took a picture of. To show it, make the
 * print in the scene's body (`createPixels`, `createPixelTexture`, a sprite with it), then copy each
 * photo into it and `updatePixelTexture`; a build script saves one with `encodePng`.
 *
 * - `region`: a rectangle of the screen in the game's pixels, or a box (or its name), the part of the
 *   screen it covers, measured even hidden: a viewfinder that is never drawn.
 * - `hide`: boxes left out (the HUD, the touch pad), by box or by name.
 * - `only`: the only boxes in it, on a transparent background: one thing alone.
 * - `width`, `height`: the photo's size, by whole pixels, never smoothed.
 * - `effects: false`: under the screen effects, as the scene is drawn.
 *
 * Works while the game is paused. Two photos asked for at once are taken one after the other.
 *
 * @returns The function that takes a photo.
 *
 * @example
 * ```ts
 * const capture = useCapture();
 * const shutter = useAction('shoot');
 * // The print the last photo shows on, made once in the body.
 * const film = createPixels(96, 72);
 * const print = createPixelTexture(film);
 * createSprite({ texture: print, transform: { x: 270, y: 50 } });
 * let score = 0;
 *
 * useUpdate(() => {
 *     if (shutter.justPressed()) {
 *         void capture({ region: 'Viewfinder', hide: ['Hud'], width: 96, height: 72 }).then((photo) => {
 *             const bird = photo.boxes.find((b) => b.name === 'Bird');
 *             score += bird ? Math.round(bird.seen * 100) : 0;
 *             film.data.set(photo.data);
 *             updatePixelTexture(print);
 *         });
 *     }
 * });
 * ```
 *
 * @category Capture
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCapture = (): TCapture => {
    const store = getActiveGame();
    if (store === null) {
        throw new Error('[NacatamalOn] useCapture: call it inside a scene body, or a behaviour\'s.');
    }
    return (options) => takePhoto(store, options);
};
