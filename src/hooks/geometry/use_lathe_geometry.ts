import { buildLathe } from '../../geometry/shapes/lathe';
import { useGeometry } from './use_geometry';
import type { TGeometry } from '../../geometry';

/**
 * What useLatheGeometry can be asked for.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TLatheGeometryOptions = {
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
     * What to keep it under. By default the profile and the faces round are the name, so two the same
     * are the same shape. Give one only to have a friendlier name.
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
    const corners = (segments + 1) * profile.length;
    if (corners > 65535) {
        throw new Error(`[NacatamalOn] useLatheGeometry: ${profile.length} points by ${segments} faces round is ${corners} corners, and a shape holds 65535. Use fewer of either.`);
    }
    const points = profile.map(({ x, y }) => ({ x, y }));
    const key = options.key ?? `lathe:${segments}:${points.map((point) => `${point.x},${point.y}`).join(';')}`;

    return useGeometry('useLatheGeometry', key, () => buildLathe(points, segments), { kind: 'lathe', profile: points, segments });
};
