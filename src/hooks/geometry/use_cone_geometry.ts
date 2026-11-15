import { buildCone } from '../../geometry/shapes/cone';
import { useGeometry, uvKeyOf, uvRecipeOf } from './use_geometry';
import type { TGeometryUvOptions } from '../../geometry/build/project_uvs';
import type { TGeometry } from '../../geometry';

/**
 * What useConeGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TConeGeometryOptions = TGeometryUvOptions & {
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
     * What to keep it under. By default every number it is asked for and how its picture is laid are
     * the name, so two that differ in any never get mixed up and two the same are the same shape. Give one only to
     * have a friendlier name: a name already taken gives back that shape, whatever is asked.
     */
    key?: string;
};

/**
 * A cone with a base.
 *
 * Built and put on the graphics card at once, so it is ready the moment you have it: nothing is
 * fetched and nothing is waited for. Hand it to `createMesh` as its `geometry`.
 *
 * Asking for the same size twice gives back the same shape, so a hundred of them cost one shape and
 * a hundred placements.
 *
 * **Its picture** goes once round the slanted side and once down it: `u` from `0` at `+x`, growing
 * to the right as the side is seen from outside, `v` from `0` at the tip to `1` at the rim. The base
 * is laid flat as a disc is, the right way round as it is seen from below.
 *
 * @param options Its size, how smooth it is, and what to keep it under.
 * @returns The shape, ready to be shown.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 4 } });
 *     const shape = useConeGeometry();
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
export const useConeGeometry = (options: TConeGeometryOptions = {}): TGeometry => {
    const radius = options.radius ?? 0.5;
    const height = options.height ?? 1;
    const segments = options.segments ?? 32;
    const key = options.key ?? `cone:${radius}:${height}:${segments}${uvKeyOf(options)}`;

    return useGeometry('useConeGeometry', key, () => buildCone(radius, height, segments), { kind: 'cone', radius, height, segments, ...uvRecipeOf(options) }, options);
};
