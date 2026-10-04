import { buildCube } from '../../geometry/shapes/cube';
import { useGeometry } from './use_geometry';
import type { TGeometry } from '../../geometry';

/**
 * What useCubeGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCubeGeometryOptions = {
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
     * What to keep it under. By default the size is the name, so two of different sizes never get
     * mixed up and two of the same size are the same shape. Give one only to have a friendlier name.
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
 * @param options Its size, how smooth it is, and what to keep it under.
 * @returns The shape, ready to be shown.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', z: 4 });
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
    const key = options.key ?? `cube:${width}:${height}:${depth}`;

    return useGeometry('useCubeGeometry', key, () => buildCube(width, height, depth), { kind: 'cube', width, height, depth });
};
