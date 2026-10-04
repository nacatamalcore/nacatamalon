import { buildCircle } from '../../geometry/shapes/circle';
import { useGeometry } from './use_geometry';
import type { TGeometry } from '../../geometry';

/**
 * What useCircleGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCircleGeometryOptions = {
    /**
     * Default `0.5`, so it is one across.
     */
    radius?: number;
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
 * A flat disc facing up.
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
 *     const shape = useCircleGeometry();
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
export const useCircleGeometry = (options: TCircleGeometryOptions = {}): TGeometry => {
    const radius = options.radius ?? 0.5;
    const segments = options.segments ?? 32;
    const key = options.key ?? `circle:${radius}:${segments}`;

    return useGeometry('useCircleGeometry', key, () => buildCircle(radius, segments), { kind: 'circle', radius, segments });
};
