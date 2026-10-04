/**
 * What a backend reads from a 2D camera. The game's camera record fits this by shape and is passed
 * as it is, so moving the camera needs nothing rebuilt.
 *
 * `transform.x`/`y` is the world point on the top-left corner of the screen, in pixels; rotation
 * and zoom pivot there. `zoom` magnifies: `2` is twice as big.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawCamera2d = {
    readonly transform: { readonly x: number; readonly y: number; readonly rotation: number };
    readonly zoom: number;
};
