/**
 * The camera a scene looks at its 2D world through. Plain data: the renderer reads it every frame,
 * so changing a field is all it takes to move, turn or zoom the view.
 *
 * `transform.x`/`y` is the world point that lands on the **top-left corner** of the screen, in
 * pixels, not its centre: following something means subtracting half the screen. Rotation and
 * zoom pivot on that same corner.
 *
 * `zoom` magnifies: `2` shows everything twice as big, `0.5` half as big.
 *
 * `type` exists for the compiler as much as for anyone reading the data: without it, any record
 * with a `transform` and a `zoom` would fit here by shape.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCamera2d = {
    readonly type: 'camera2d';
    id: string;
    /**
     * Where the camera is and how it is turned. No scale: a camera does not stretch, and a field
     * nothing reads is a field someone will set and wonder why nothing happened.
     */
    transform: { x: number; y: number; rotation: number };
    /**
     * Magnification. `1` is none, `2` twice as big.
     */
    zoom: number;
};

/**
 * What a camera can start with. Everything is optional.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCamera2dOptions = {
    /**
     * The world point on the top-left corner of the screen, in pixels. Default `0`.
     */
    x?: number;
    y?: number;
    /**
     * In radians. Default `0`.
     */
    rotation?: number;
    /**
     * Magnification. Default `1`.
     */
    zoom?: number;
};
