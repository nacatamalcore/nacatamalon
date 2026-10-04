import { buildCylinder } from '../../geometry/shapes/cylinder';
import { useGeometry } from './use_geometry';
import type { TGeometry } from '../../geometry';

/**
 * What useCylinderGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCylinderGeometryOptions = {
    /**
     * Default `0.5`.
     */
    radius?: number;
    /**
     * Default `1`.
     */
    height?: number;
    /**
     * How round it is. Default `32`.
     */
    segments?: number;
    /**
     * What to keep it under. By default the size is the name, so two of different sizes never get
     * mixed up and two of the same size are the same shape. Give one only to have a friendlier name.
     */
    key?: string;
};

/**
 * A tube with a lid and a base.
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
 *     const shape = useCylinderGeometry();
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
export const useCylinderGeometry = (options: TCylinderGeometryOptions = {}): TGeometry => {
    const radius = options.radius ?? 0.5;
    const height = options.height ?? 1;
    const segments = options.segments ?? 32;
    const key = options.key ?? `cylinder:${radius}:${height}:${segments}`;

    return useGeometry('useCylinderGeometry', key, () => buildCylinder(radius, height, segments), { kind: 'cylinder', radius, height, segments });
};
