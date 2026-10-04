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
};
