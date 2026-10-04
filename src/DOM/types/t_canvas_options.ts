import type { TCanvasKeep } from './t_canvas_keep';
import type { TCanvasScaling } from './t_canvas_scaling';

/**
 * Everything that decides the canvas's size.
 *
 * @category Game
 * @since 1.0.0
 */
export type TCanvasOptions = {
    /**
     * Base resolution: how many pixels the game draws, not its size on screen.
     */
    width: number;
    height: number;
    /**
     * Filter the magnification instead of leaving it hard. Defaults to `false`.
     */
    smooth?: boolean;
    /**
     * Defaults to `'none'`.
     */
    scaling?: TCanvasScaling;
    /**
     * Defaults to `'both'`.
     */
    keep?: TCanvasKeep;
    /**
     * How many real pixels each game pixel is drawn with. Defaults to `1`; `'device'` follows the
     * screen's `devicePixelRatio`. Only the drawing buffer grows: `width`, `height` and the size on
     * screen stay the same.
     */
    pixelRatio?: number | 'device';
    /**
     * How it scales while full screen. Defaults to `'integer'`.
     */
    fullscreenScaling?: TCanvasScaling;
};
