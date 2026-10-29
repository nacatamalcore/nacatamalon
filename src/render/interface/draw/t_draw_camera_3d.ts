/**
 * What a backend needs to look at a 3D world: where the camera is and how it flattens what it sees.
 *
 * Owned by the renderer, like every other draw type. The game's camera record fits by shape, so the
 * same object is passed and nothing is copied.
 *
 * @category Render
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TDrawCamera3d = {
    readonly projection: 'perspective' | 'orthographic';
    /**
     * Where it is and how it is turned. Scale is ignored: a camera does not stretch.
     */
    readonly transform: {
        x: number; y: number; z: number;
        rotation: number; rotationX: number; rotationY: number;
        scaleX: number; scaleY: number; scaleZ: number;
    };
    /**
     * In degrees, perspective only.
     */
    readonly fov: number;
    readonly near: number;
    readonly far: number;
    /**
     * Orthographic only, where one unit is one pixel.
     */
    readonly zoom: number;
    /**
     * The 2D camera the models are seen through instead, as sprites are, `y` going down: set by the
     * frame for a camera that follows the 2D one (`TCamera3d.follow2d`). Its `x`, `y`, turn and zoom
     * replace this camera's; `z` and `far` are still this camera's. `null` or absent: a 3D camera of
     * its own.
     */
    readonly flat?: { readonly x: number; readonly y: number; readonly rotation: number; readonly zoom: number } | null;
    /**
     * Another camera, which decides what this one draws: models it does not see are skipped here
     * too. For looking at what a camera skips from outside it. `null` or absent: this camera's own.
     */
    readonly cullingCamera?: TDrawCamera3d | null;
};
