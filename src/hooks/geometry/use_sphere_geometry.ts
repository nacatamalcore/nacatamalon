import { buildUvSphere } from '../../geometry/shapes/uv_sphere';
import { useGeometry, uvKeyOf, uvRecipeOf } from './use_geometry';
import type { TGeometryUvOptions } from '../../geometry/build/project_uvs';
import type { TGeometry } from '../../geometry';

/**
 * What useSphereGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSphereGeometryOptions = TGeometryUvOptions & {
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
     * What to keep it under. By default every number it is asked for and how its picture is laid are
     * the name, so two that differ in any never get mixed up and two the same are the same shape. Give one only to
     * have a friendlier name: a name already taken gives back that shape, whatever is asked.
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
 * **Its picture** goes once round and once down, the way a map of the world wraps a globe: `u` from
 * `0` at `+x`, growing to the right as the ball is seen from outside (`0.25` at `-z`, `0.5` at `-x`,
 * `0.75` at `+z`), `v` from `0` at the top pole to `1` at the bottom one.
 *
 * @param options Its size, how smooth it is, and what to keep it under.
 * @returns The shape, ready to be shown.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 4 } });
 *     const shape = useSphereGeometry();
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
export const useSphereGeometry = (options: TSphereGeometryOptions = {}): TGeometry => {
    const radius = options.radius ?? 0.5;
    const segments = options.segments ?? 32;
    const rings = options.rings ?? 16;
    const key = options.key ?? `uv_sphere:${radius}:${segments}:${rings}${uvKeyOf(options)}`;

    return useGeometry('useSphereGeometry', key, () => buildUvSphere(radius, segments, rings), { kind: 'uvSphere', radius, segments, rings, ...uvRecipeOf(options) }, options);
};
