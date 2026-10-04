import { buildPlane } from '../../geometry/shapes/plane';
import { useGeometry } from './use_geometry';
import type { TGeometry } from '../../geometry';

/**
 * What usePlaneGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TPlaneGeometryOptions = {
    /**
     * Across. Default `1`.
     */
    width?: number;
    /**
     * Away. Default `1`.
     */
    depth?: number;
    /**
     * How many squares across. Default `1`.
     */
    widthSegments?: number;
    /**
     * How many away. Default `1`.
     */
    depthSegments?: number;
    /**
     * What to keep it under. By default the size is the name, so two of different sizes never get
     * mixed up and two of the same size are the same shape. Give one only to have a friendlier name.
     */
    key?: string;
};

/**
 * A flat sheet lying like a floor, facing up. Cut it into squares to bend it later.
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
 *     const shape = usePlaneGeometry();
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
export const usePlaneGeometry = (options: TPlaneGeometryOptions = {}): TGeometry => {
    const width = options.width ?? 1;
    const depth = options.depth ?? 1;
    const widthSegments = options.widthSegments ?? 1;
    const depthSegments = options.depthSegments ?? 1;
    const key = options.key ?? `plane:${width}:${depth}:${widthSegments}:${depthSegments}`;

    return useGeometry('usePlaneGeometry', key, () => buildPlane(width, depth, widthSegments, depthSegments), { kind: 'plane', width, depth, widthSegments, depthSegments });
};
