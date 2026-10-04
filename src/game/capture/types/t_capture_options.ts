import type { TColor } from '../../../color';
import type { TCamera2d } from '../../../camera/types/t_camera_2d';
import type { TCamera3d } from '../../../camera/types/t_camera_3d';
import type { TDrawable } from '../../../gameobjects/types';

/**
 * What a capture is a picture of. Every field left out means **what the screen is showing**, so
 * `capture()` with nothing is a picture of the screen.
 *
 * In the cameras and in `layers`, leaving a field out and writing `null` differ, and the difference
 * is the reason a capture has options at all. Left out, it is the screen's: the camera a tool is
 * flying, the kinds it is hiding. `null` is **the game's**: each scene's own camera, or none, and
 * every kind. A tool working on the flat half of a level hides the models and looks through a camera
 * of its own, and a picture of the game taken from it has to undo both.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCaptureOptions = {
    /**
     * The 3D camera to look through. Left out, the screen's: the tool's, or else each scene's own. `null`, each scene's own.
     */
    camera3d?: TCamera3d | null;
    /**
     * The 2D camera to look through. Left out, the screen's. `null`, each scene's own, and a scene
     * with none is drawn in screen pixels, which is what that game shows.
     */
    camera2d?: TCamera2d | null;
    /**
     * Width of the picture in pixels. Left out, the canvas's.
     */
    width?: number;
    /**
     * Height of the picture in pixels. Left out, the canvas's.
     */
    height?: number;
    /**
     * The kinds of drawing to keep. Left out, what the screen keeps; `null`, all of them.
     */
    layers?: ReadonlyArray<TDrawable['type']> | null;
    /**
     * The colour behind everything. Left out, the game's background.
     */
    background?: TColor;
};
