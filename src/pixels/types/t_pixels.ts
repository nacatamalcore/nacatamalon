/**
 * A picture held in memory, to paint on in code and then hand to `createPixelTexture`: the engine's
 * replacement for drawing on a `<canvas>`, which only exists in a browser. Drawn art is loaded with
 * `useLoadTexture` instead; this is for pictures that are generated.
 *
 * Four bytes a pixel (red, green, blue, alpha, each `0` to `255`), row after row, with row `0` at the
 * **top**: the same way round as an image file and as the game's own `y`. Nothing in it touches the
 * graphics card, the page or a game, so the same picture can be painted in a scene, in a test, in a
 * build script or on the native runtime and comes out byte for byte the same.
 *
 * `data` is yours to read and write directly when the painting functions are not enough; it is
 * `width × height × 4` long and never replaced.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPixels = {
    readonly type: 'pixels';
    readonly width: number;
    readonly height: number;
    readonly data: Uint8Array;
};

/**
 * A rectangle of a picture, in its pixels, from its top-left corner.
 *
 * @category Pixels
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPixelRegion = {
    x: number;
    y: number;
    width: number;
    height: number;
};
