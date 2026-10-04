/**
 * Pixels brought back from the graphics card, as `RGBA8`, row by row from the top-left corner.
 *
 * Top-left because that is where every other picture in this engine starts. WebGL2 reads from the
 * bottom, so its backend turns the rows around before handing them over: a picture that comes back
 * upside down depending on which backend ran is exactly the kind of difference the interface exists
 * to hide.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCaptureResult = {
    width: number;
    height: number;
    /**
     * `width * height * 4` bytes.
     */
    data: Uint8Array;
};
