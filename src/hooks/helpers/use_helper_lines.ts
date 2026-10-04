import { newLines, writeLines } from '../../gameobjects/lines';
import type { TNewLinesOptions } from '../../gameobjects/lines';
import type { TLines } from '../../gameobjects/lines';

/**
 * What `useHelperLines` is asked for.
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUseHelperLinesOptions = TNewLinesOptions & {
    /**
     * The first lines to draw. Left out, it starts empty, which is normal for lines rewritten every frame.
     */
    vertices?: Float32Array;
};

/**
 * What `useHelperLines` gives back: the lines, and the function that replaces them.
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type THelperLines = [lines: TLines, setVertices: (vertices: Float32Array) => void];

/**
 * Draws any lines you like, and hands back the function that replaces them at any time.
 *
 * The one to reach for when what has to be seen changes: an outline that follows what the player
 * picked, the path an enemy is about to take, the shape of a collider being tuned. The axis gizmo and
 * the floor grid are this with the corners worked out for you.
 *
 * Each corner is seven numbers, `x, y, z, r, g, b, a`, and every two corners make a line. They are
 * measured from where the lines are placed, so lines made inside a moving thing move with it.
 * `setVertices` copies what it is given, so the same array can be reused every frame.
 *
 * Lines are drawn in the scene's 3D view: models in front hide them, and they hide what is behind
 * them. They are one pixel wide.
 *
 * @param options The first lines, and where they are drawn from.
 * @returns The lines and the function that replaces them.
 *
 * @example
 * ```ts
 * declare const target: { x: number; y: number; z: number };
 *
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', fov: 60, z: 6 });
 *     const [, setPath] = useHelperLines();
 *
 *     useUpdate(() => {
 *         // One yellow line from the origin to wherever the enemy is heading.
 *         setPath(new Float32Array([0, 0, 0, 1, 1, 0, 1, target.x, target.y, target.z, 1, 1, 0, 1]));
 *     });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Debug
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useHelperLines = (options: TUseHelperLinesOptions = {}): THelperLines => {
    const lines = newLines('useHelperLines', options, options.vertices ?? new Float32Array(0));
    return [lines, (vertices: Float32Array) => writeLines(lines, vertices)];
};
