import { buildLathe } from '../../geometry/shapes/lathe';
import { useGeometry, uvKeyOf, uvRecipeOf } from './use_geometry';
import type { TGeometryUvOptions } from '../../geometry/build/project_uvs';
import type { TGeometry } from '../../geometry';

/**
 * What useLatheGeometry can be asked for.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLatheGeometryOptions = TGeometryUvOptions & {
    /**
     * Half the outline, from the bottom up: for each point, `x` is how far it is from the axis and
     * `y` how high. At least two points. A point on the axis (`x: 0`) closes the shape there, as the
     * middle of a bottle's base; a point given twice in a row is a hard edge, as the rim of the base.
     */
    profile: ReadonlyArray<{ x: number; y: number }>;
    /**
     * How many faces round. Few is the faceted look of the time; many is round. Default `32`.
     */
    segments?: number;
    /**
     * What to keep it under. By default the profile, the faces round and how its picture is laid are
     * the name, so two the same are the same shape. Give one only to have a friendlier name: a name
     * already taken gives back that shape, whatever is asked.
     */
    key?: string;
};

/**
 * A shape turned on a lathe: half an outline, its profile, spun about the upright axis into a solid,
 * as a turner shapes a chair leg or a potter a vase. A bottle, a glass, a vase, a chess piece, a
 * column, a barrel, a lamp, a bowling pin, in a handful of points.
 *
 * ```
 *  the profile        what it makes
 *   ●                    ___
 *    ●                  (   )
 *   ●         →          \ /
 *   ●                    | |
 *  ●                    /___\
 * ```
 *
 * Asking for the same profile twice gives back the same shape, so a shelf of a hundred bottles costs
 * one shape and a hundred placements. The profile goes from the bottom up; given the other way, the
 * shape is turned inside out and seen only from within.
 *
 * **Its picture** goes once round (`u`, from `0` at `+x`, growing to the right as the side is seen
 * from outside) and once down the profile by its length (`v`, from `0` at the top), so a label
 * wrapped round a bottle is not stretched where the profile is steep. A flat ring (the numbers round
 * a wheel, a dial's rim) is two points, from the outside in, `[{ x: 1.3, y: 0 }, { x: 1, y: 0 }]`:
 * it faces up, and a strip of pictures goes once round it with its top at the inner edge, each one
 * upright for whoever reads it from outside.
 *
 * @param options The profile, and how many faces round.
 * @returns The shape, ready to be shown.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { y: 1, z: 4 } });
 *     useDirectionalLight({ intensity: 1 });
 *
 *     const bottle = useLatheGeometry({
 *         profile: [
 *             { x: 0, y: 0 },       // the middle of the base
 *             { x: 0.4, y: 0 },     // its rim, given twice: a hard edge
 *             { x: 0.4, y: 0 },
 *             { x: 0.4, y: 1.2 },   // the body
 *             { x: 0.15, y: 1.6 },  // the shoulder
 *             { x: 0.12, y: 2 },    // the neck, open at the top
 *         ],
 *         segments: 24,
 *     });
 *     createMesh({ geometry: bottle, tint: '#5fd068' });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useLatheGeometry = (options: TLatheGeometryOptions): TGeometry => {
    const profile = options.profile;
    if (profile === undefined || profile.length < 2) {
        throw new Error('[NacatamalOn] useLatheGeometry: the profile needs two points at least, from the bottom up.');
    }
    for (const [i, point] of profile.entries()) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0) {
            throw new Error(`[NacatamalOn] useLatheGeometry: profile point ${i} is (${point.x}, ${point.y}). Each needs a number for x and y, and x is how far from the axis, so not below 0.`);
        }
    }
    const segments = Math.max(3, Math.floor(options.segments ?? 32));
    const points = profile.map(({ x, y }) => ({ x, y }));
    const key = options.key ?? `lathe:${segments}:${points.map((point) => `${point.x},${point.y}`).join(';')}${uvKeyOf(options)}`;

    return useGeometry('useLatheGeometry', key, () => buildLathe(points, segments), { kind: 'lathe', profile: points, segments, ...uvRecipeOf(options) }, options);
};
