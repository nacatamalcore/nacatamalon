import type { TTransform3d } from '../../gameobjects/types/t_transform_3d';

/**
 * The camera a scene looks at its 3D world through. Plain data, like the 2D one: the renderer reads
 * it every frame, so changing a field is all it takes to move, turn or zoom the view.
 *
 * Two ways of seeing, and the choice is what the game is:
 *
 * - `'perspective'` is the usual one: things get smaller with distance, and `fov` says how much is
 *   in view.
 * - `'orthographic'` has no vanishing point and **measures in the same pixels a sprite does**: a
 *   model one unit wide is one pixel wide. That is what lets a 3D piece stand on a 2D board and pan
 *   and zoom with it, which is how the consoles of the era mixed the two.
 *
 * Y points up here, the opposite of the 2D camera, because every model is built that way and
 * mirroring the axis would turn each one inside out.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCamera3d = {
    readonly type: 'camera3d';
    id: string;
    projection: 'perspective' | 'orthographic';
    /**
     * Where the camera is and how it is turned. No scale: a camera does not stretch.
     */
    transform: TTransform3d;
    /**
     * How wide the view is, in degrees. Perspective only.
     */
    fov: number;
    /**
     * Nothing closer than this is drawn, and nothing further than `far`.
     */
    near: number;
    far: number;
    /**
     * Magnification. Orthographic only: `2` shows everything twice as big.
     */
    zoom: number;
};

/**
 * What a 3D camera can start with. Everything is optional.
 *
 * @category Camera
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCamera3dOptions = {
    /**
     * Default `'orthographic'`, which measures in pixels and lines up with the 2D.
     */
    projection?: 'perspective' | 'orthographic';
    /**
     * Where it is. Default the origin, looking along -Z.
     */
    x?: number;
    y?: number;
    z?: number;
    /**
     * Looking up and down, and turning left and right, in radians.
     */
    rotationX?: number;
    rotationY?: number;
    /**
     * Rolling, in radians.
     */
    rotation?: number;
    /**
     * In degrees. Default `60`. Perspective only.
     */
    fov?: number;
    /**
     * Default `0.1` and `1000`.
     */
    near?: number;
    far?: number;
    /**
     * Default `1`. Orthographic only.
     */
    zoom?: number;
};
