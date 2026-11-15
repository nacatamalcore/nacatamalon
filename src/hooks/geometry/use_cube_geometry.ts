import { buildCube } from '../../geometry/shapes/cube';
import { useGeometry, uvKeyOf, uvRecipeOf } from './use_geometry';
import type { TGeometryUvOptions } from '../../geometry/build/project_uvs';
import type { TGeometry } from '../../geometry';

/**
 * What useCubeGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCubeGeometryOptions = TGeometryUvOptions & {
    /**
     * Across. Default `1`.
     */
    width?: number;
    /**
     * Up. Default `1`.
     */
    height?: number;
    /**
     * Towards the viewer. Default `1`.
     */
    depth?: number;
    /**
     * What to keep it under. By default every number it is asked for and how its picture is laid are
     * the name, so two that differ in any never get mixed up and two the same are the same shape. Give one only to
     * have a friendlier name: a name already taken gives back that shape, whatever is asked.
     */
    key?: string;
};

/**
 * A cube, or any box shape: as wide, tall and deep as you ask.
 *
 * Built and put on the graphics card at once, so it is ready the moment you have it: nothing is
 * fetched and nothing is waited for. Hand it to `createMesh` as its `geometry`.
 *
 * Asking for the same size twice gives back the same shape, so a hundred of them cost one shape and
 * a hundred placements.
 *
 * **Its picture** is laid once on each face, upright as the face is seen from outside, `0, 0` at
 * the face's top left: the sides with up as up, the top as seen from the front (its far edge at
 * the top of the picture), the bottom as seen from below. The same as `uvs: 'box'`; with
 * `uvScale` the picture is laid by the box's units instead, the same size on a box of any size.
 *
 * @param options Its size, how smooth it is, and what to keep it under.
 * @returns The shape, ready to be shown.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 4 } });
 *     const shape = useCubeGeometry();
 *     createMesh({ geometry: shape });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCubeGeometry = (options: TCubeGeometryOptions = {}): TGeometry => {
    const width = options.width ?? 1;
    const height = options.height ?? 1;
    const depth = options.depth ?? 1;
    const key = options.key ?? `cube:${width}:${height}:${depth}${uvKeyOf(options)}`;

    return useGeometry('useCubeGeometry', key, () => buildCube(width, height, depth), { kind: 'cube', width, height, depth, ...uvRecipeOf(options) }, options);
};
