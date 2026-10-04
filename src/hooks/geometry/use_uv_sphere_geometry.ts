import { buildUvSphere } from '../../geometry/shapes/uv_sphere';
import { useGeometry } from './use_geometry';
import type { TGeometry } from '../../geometry';

/**
 * What useUvSphereGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TUvSphereGeometryOptions = {
    /**
     * Default `0.5`, so it is one across.
     */
    radius?: number;
    /**
     * Around. Default `32`.
     */
    segments?: number;
    /**
     * From pole to pole. Default `16`.
     */
    rings?: number;
    /**
     * What to keep it under. By default the size is the name, so two of different sizes never get
     * mixed up and two of the same size are the same shape. Give one only to have a friendlier name.
     */
    key?: string;
};

/**
 * A ball built as lines of latitude, the way a globe is drawn. Its squares bunch up at the poles, which is the price of a picture that wraps round it neatly.
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
 *     const shape = useUvSphereGeometry();
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
export const useUvSphereGeometry = (options: TUvSphereGeometryOptions = {}): TGeometry => {
    const radius = options.radius ?? 0.5;
    const segments = options.segments ?? 32;
    const rings = options.rings ?? 16;
    const key = options.key ?? `uv_sphere:${radius}:${segments}:${rings}`;

    return useGeometry('useUvSphereGeometry', key, () => buildUvSphere(radius, segments, rings), { kind: 'uvSphere', radius, segments, rings });
};
