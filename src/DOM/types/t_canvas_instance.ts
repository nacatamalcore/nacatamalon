import type { TCanvasFullscreen } from '../fullscreen';
import type { TCanvasFit } from './t_canvas_fit';

/**
 * What `createCanvas` returns.
 *
 * @category Game
 * @since 1.0.0
 */
export type TCanvasInstance = {
    /**
     * Unique id for this canvas, used in the DOM and CSS.
     */
    id: string;
    /**
     * The element, already in the DOM.
     */
    canvas: HTMLCanvasElement;
    /**
     * Full screen for this canvas: entering, leaving, and whether it is.
     */
    fullscreen: TCanvasFullscreen;
    /**
     * Fits the canvas another way until called with `null`, which puts the game's own fit back.
     * See {@link TCanvasFit}.
     */
    setFit(fit: TCanvasFit | null): void;
    /**
     * Paints the game's pixels this much wider than tall from now on (`pixelAspect`), and fits the
     * canvas again.
     */
    setPixelAspect(aspect: number): void;
    /**
     * Stops the observer, and removes the canvas only if we created it.
     */
    destroy(): void;
};
