import type { TCanvasFullscreen } from '../fullscreen';

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
     * Stops the observer, and removes the canvas only if we created it.
     */
    destroy(): void;
};
