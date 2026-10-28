export type TCanvasLayout = {
    /**
     * Drawing buffer: how many pixels the game renders.
     */
    bufferWidth: number;
    bufferHeight: number;
    /**
     * On-screen size that buffer is painted at.
     */
    cssWidth: number;
    cssHeight: number;
    /**
     * The uniform factor, in CSS pixels: with `integer` on a screen whose density is not whole it
     * has fractions (5.6 is 7 of the screen's pixels at 1.25). `fill` has none (it distorts) and
     * reports 1.
     */
    scale: number;
};