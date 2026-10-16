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
 * mirroring the axis would turn each one inside out. Unless it follows the 2D camera (`follow2d`):
 * then the 3D pieces live in the 2D world, y down, among the sprites.
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
     *
     * An orthographic camera reads only `far`, and sees that far behind it as well as in front, so
     * whatever sits around its `z` is drawn, as a sprite would be.
     */
    near: number;
    far: number;
    /**
     * Magnification. Orthographic only: `2` shows everything twice as big.
     */
    zoom: number;
    /**
     * Orthographic only: the 3D pieces are placed in the 2D world, as sprites are, and seen through
     * the scene's 2D camera. A model at `(x, y)` is drawn where a sprite at `(x, y)` is, `y` going
     * down; the 2D camera's pan, turn and zoom move both alike, and this camera's own `x`, `y` and
     * `zoom` are not read (its `z` and `far` still are). For a 2D game with pieces drawn in 3D: a
     * cell's membrane that wobbles, a coin that turns in depth. The models stay upright and lit as
     * they were built: only where they are is measured the 2D way. Default `false`.
     */
    follow2d?: boolean;
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
     * Orthographic only: the models placed in the 2D world and seen through the 2D camera. See
     * `TCamera3d.follow2d`. Default `false`.
     */
    follow2d?: boolean;
    /**
     * Default `0.1` and `1000`. An orthographic camera reads only `far`, and sees that far either
     * side of it.
     */
    near?: number;
    far?: number;
    /**
     * Default `1`. Orthographic only.
     */
    zoom?: number;
};
