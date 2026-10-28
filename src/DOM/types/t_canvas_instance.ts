import type { TCanvasFullscreen } from '../fullscreen';
import type { TCanvasFit } from './t_canvas_fit';
import type { TCanvasOptions } from './t_canvas_options';

/**
 * What of the canvas's options a running game can change: how it is fitted to the page.
 *
 * @category Game
 * @since 1.0.0
 */
export type TCanvasLiveOptions = Partial<Pick<TCanvasOptions, 'scaling' | 'pixelAspect'>>;

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
     * Changes how the game is fitted to the page from now on (its `scaling`, its `pixelAspect`), and
     * fits the canvas again. While full screen, its own scaling still wins until it is left.
     */
    setCanvasOptions(options: TCanvasLiveOptions): void;
    /**
     * Stops the observer, and removes the canvas only if we created it.
     */
    destroy(): void;
};
