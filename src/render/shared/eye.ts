/**
 * Where the camera stands, in the world: what a material's colour hook is told as `ctx.cameraPos`.
 *
 * The camera's transform is one, as it is: the pass that lights the scene reads its place from there.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TEye = { readonly x: number; readonly y: number; readonly z: number };

/**
 * A scene with no camera is looked at from the origin, as the pass that lights it is.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const NO_EYE: TEye = { x: 0, y: 0, z: 0 };
