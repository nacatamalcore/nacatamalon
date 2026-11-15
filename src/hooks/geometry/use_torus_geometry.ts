import { buildTorus } from '../../geometry/shapes/torus';
import { useGeometry, uvKeyOf, uvRecipeOf } from './use_geometry';
import type { TGeometryUvOptions } from '../../geometry/build/project_uvs';
import type { TGeometry } from '../../geometry';

/**
 * What useTorusGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TTorusGeometryOptions = TGeometryUvOptions & {
    /**
     * From the middle to the middle of the tube. Default `0.5`.
     */
    radius?: number;
    /**
     * How thick the tube is. Default `0.2`.
     */
    tube?: number;
    /**
     * Around the ring. Default `32`.
     */
    radialSegments?: number;
    /**
     * Around the tube. Default `16`.
     */
    tubularSegments?: number;
    /**
     * What to keep it under. By default every number it is asked for and how its picture is laid are
     * the name, so two that differ in any never get mixed up and two the same are the same shape. Give one only to
     * have a friendlier name: a name already taken gives back that shape, whatever is asked.
     */
    key?: string;
};

/**
 * A ring, like a doughnut.
 *
 * Built and put on the graphics card at once, so it is ready the moment you have it: nothing is
 * fetched and nothing is waited for. Hand it to `createMesh` as its `geometry`.
 *
 * Asking for the same size twice gives back the same shape, so a hundred of them cost one shape and
 * a hundred placements.
 *
 * **Its picture** goes once round the tube and once round the ring: `u` round the tube, from `0` on
 * its outer edge (`0.25` on top, `0.5` on the inner edge, `0.75` underneath); `v` round the ring,
 * from `0` at `+x` (`0.25` at `-z`, `0.5` at `-x`, `0.75` at `+z`).
 *
 * @param options Its size, how smooth it is, and what to keep it under.
 * @returns The shape, ready to be shown.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 4 } });
 *     const shape = useTorusGeometry();
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
export const useTorusGeometry = (options: TTorusGeometryOptions = {}): TGeometry => {
    const radius = options.radius ?? 0.5;
    const tube = options.tube ?? 0.2;
    const radialSegments = options.radialSegments ?? 32;
    const tubularSegments = options.tubularSegments ?? 16;
    const key = options.key ?? `torus:${radius}:${tube}:${radialSegments}:${tubularSegments}${uvKeyOf(options)}`;

    return useGeometry('useTorusGeometry', key, () => buildTorus(radius, tube, radialSegments, tubularSegments), { kind: 'torus', radius, tube, radialSegments, tubularSegments, ...uvRecipeOf(options) }, options);
};
