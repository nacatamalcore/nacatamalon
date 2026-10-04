import { buildIcoSphere } from '../../geometry/shapes/ico_sphere';
import { useGeometry } from './use_geometry';
import type { TGeometry } from '../../geometry';

/**
 * What useIcoSphereGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TIcoSphereGeometryOptions = {
    /**
     * Default `0.5`.
     */
    radius?: number;
    /**
     * How many times each triangle is split. Default `2`. Each one costs four times as many.
     */
    subdivisions?: number;
    /**
     * What to keep it under. By default the size is the name, so two of different sizes never get
     * mixed up and two of the same size are the same shape. Give one only to have a friendlier name.
     */
    key?: string;
};

/**
 * A ball whose triangles are all about the same size. The one to reach for when the surface is going to be lit or bent, because the globe-style ball has slivers at its poles and they show.
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
 *     const shape = useIcoSphereGeometry();
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
export const useIcoSphereGeometry = (options: TIcoSphereGeometryOptions = {}): TGeometry => {
    const radius = options.radius ?? 0.5;
    const subdivisions = options.subdivisions ?? 2;
    const key = options.key ?? `ico_sphere:${radius}:${subdivisions}`;

    return useGeometry('useIcoSphereGeometry', key, () => buildIcoSphere(radius, subdivisions), { kind: 'icoSphere', radius, subdivisions });
};
