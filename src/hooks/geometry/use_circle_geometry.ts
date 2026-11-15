import { buildCircle } from '../../geometry/shapes/circle';
import { useGeometry, uvKeyOf, uvRecipeOf } from './use_geometry';
import type { TGeometryUvOptions } from '../../geometry/build/project_uvs';
import type { TGeometry } from '../../geometry';

/**
 * What useCircleGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCircleGeometryOptions = TGeometryUvOptions & {
    /**
     * Default `0.5`, so it is one across.
     */
    radius?: number;
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
 * A flat disc facing up.
 *
 * Built and put on the graphics card at once, so it is ready the moment you have it: nothing is
 * fetched and nothing is waited for. Hand it to `createMesh` as its `geometry`.
 *
 * Asking for the same size twice gives back the same shape, so a hundred of them cost one shape and
 * a hundred placements.
 *
 * **Its picture** is laid flat over it, as over a plane: the middle of the picture at the middle
 * of the disc, `u` along `+x` and `v` along `+z`.
 *
 * @param options Its size, how smooth it is, and what to keep it under.
 * @returns The shape, ready to be shown.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 4 } });
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
    const key = options.key ?? `circle:${radius}:${segments}${uvKeyOf(options)}`;

    return useGeometry('useCircleGeometry', key, () => buildCircle(radius, segments), { kind: 'circle', radius, segments, ...uvRecipeOf(options) }, options);
};
