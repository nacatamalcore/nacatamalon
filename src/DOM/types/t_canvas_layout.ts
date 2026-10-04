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
     * The uniform factor. `fill` has none (it distorts) and reports 1.
     */
    scale: number;
};