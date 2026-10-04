import type { TCamera2d } from '../../../camera/types/t_camera_2d';
import type { TCamera3d } from '../../../camera/types/t_camera_3d';
import type { TDrawable } from '../../../gameobjects/types';

/**
 * A second, live view of the game on a canvas of its own: what an editor shows in a corner so the
 * shot a camera makes can be watched while the editing camera flies elsewhere.
 *
 * The fields mean what they mean in a capture (`TCaptureOptions`): left out is **what the screen
 * shows**, and `null` is **the game's**, each scene's own camera and every kind of drawing. A preview
 * of the game is `{ canvas, camera3d: null, camera2d: null, layers: null }`.
 *
 * Drawn at the canvas's own size, so giving the canvas the game's width and height makes it the
 * game's picture, effects included, which the page then scales however it likes.
 *
 * @category Game
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCameraPreview = {
    /**
     * Where it is drawn. A canvas nothing else draws on.
     */
    canvas: HTMLCanvasElement;
    /**
     * The 3D camera to look through. Left out, the screen's. `null`, each scene's own.
     */
    camera3d?: TCamera3d | null;
    /**
     * The 2D camera to look through. Left out, the screen's. `null`, each scene's own.
     */
    camera2d?: TCamera2d | null;
    /**
     * The kinds of drawing to show. Left out, what the screen shows; `null`, all of them.
     */
    layers?: ReadonlyArray<TDrawable['type']> | null;
};

/**
 * A preview with every choice made: what the frame reads.
 *
 * @internal
 */
export type TPreviewRequest = {
    canvas: HTMLCanvasElement;
    camera3d: TCamera3d | null;
    camera2d: TCamera2d | null;
    layers: ReadonlyArray<TDrawable['type']> | null;
};
