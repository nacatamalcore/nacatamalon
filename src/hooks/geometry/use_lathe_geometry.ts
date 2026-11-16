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
     * middle of a bottle's base; a point given twice in a row is a hard edge, as the rim of the base,
     * and so is every turn sharper than `creaseAngle` when one is given.
     */
    profile: ReadonlyArray<{ x: number; y: number }>;
    /**
     * How many faces round, or across `arc` when it goes part of the way. Few is the faceted look
     * of the time; many is round. Default `32`. At least one for every third of a turn: `3` all the
     * way round, `2` for half of it, `1` for a narrow slice, one face across.
     */
    segments?: number;
    /**
     * Where the turn starts, in radians from `+x`, the way `rotationY` turns (a quarter, `Math.PI /
     * 2`, is `-z`). Default `0`.
     */
    startAngle?: number;
    /**
     * How far round it is turned, in radians, from `startAngle`: `Math.PI` is half of it, a slice
     * of a wheel is `Math.PI * 2 / 37`. Above 0 and at most `Math.PI * 2`, the default, all the way
     * round. Part of the way, its two ends are left open.
     */
    arc?: number;
    /**
     * How sharply, in radians, the profile has to turn at a point for the surface to meet there in a
     * hard edge rather than round smoothly: with `Math.PI / 6`, 30°, the rim of a can is hard and the
     * belly of a vase drawn in many points is round. Left out, it is smooth all along, because a
     * profile is mostly a curve drawn in a few points, each turning well past 30°; the corners meant
     * hard are given twice. (`useExtrudeGeometry` has one by default, as an outline in a few points
     * is mostly a shape with corners.) Round the axis it is always smooth.
     */
    creaseAngle?: number;
    /**
     * What to keep it under. By default everything it is asked for is the name, so two the same are
     * the same shape. Give one only to have a friendlier name: a name
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
 * **Part of the way round**, `arc` from `startAngle`, it is a slice: the pocket of a roulette wheel,
 * a half pipe, an arch. Its ends are left open. Slices in different colours are one shape with
 * `mergeGeometries`, each turned to its place with its own `tint`: one draw for the whole wheel.
 *
 * **Its picture** goes once round (`u`, from `0` at `startAngle`, growing to the right as the side
 * is seen from outside; across the slice when it goes part of the way) and once down the profile by
 * its length (`v`, from `0` at the top), so a label wrapped round a bottle is not stretched where the
 * profile is steep. A flat ring (the numbers round
 * a wheel, a dial's rim) is two points, from the outside in, `[{ x: 1.3, y: 0 }, { x: 1, y: 0 }]`:
 * it faces up, and a strip of pictures goes once round it with its top at the inner edge, each one
 * upright for whoever reads it from outside.
 *
 * @param options The profile, how many faces round, how far round and where its edges are hard.
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
 *     // A wheel of 37 pockets, red and black and one green, as one shape.
 *     const pocket = useLatheGeometry({
 *         profile: [{ x: 1.3, y: 0 }, { x: 1, y: 0 }],
 *         arc: (Math.PI * 2) / 37,
 *         segments: 1,
 *     });
 *     const wheel = mergeGeometries(Array.from({ length: 37 }, (_, i) => ({
 *         geometry: pocket,
 *         rotationY: (i * Math.PI * 2) / 37,
 *         tint: i === 0 ? '#1f8a3b' : i % 2 === 1 ? '#c0282d' : '#1b1b1b',
 *     })));
 *     createMesh({ geometry: wheel, transform: { x: 2 } });
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
    const startAngle = options.startAngle ?? 0;
    if (!Number.isFinite(startAngle)) {
        throw new Error(`[NacatamalOn] useLatheGeometry: startAngle is ${startAngle}, and it takes where the turn starts, in radians from +x.`);
    }
    const arc = options.arc ?? Math.PI * 2;
    if (!Number.isFinite(arc) || arc <= 0 || arc > Math.PI * 2) {
        throw new Error(`[NacatamalOn] useLatheGeometry: arc is ${arc}, and it takes how far round it is turned, in radians: above 0 and at most Math.PI * 2, all the way round.`);
    }
    const creaseAngle = options.creaseAngle ?? null;
    if (creaseAngle !== null && (!Number.isFinite(creaseAngle) || creaseAngle < 0)) {
        throw new Error(`[NacatamalOn] useLatheGeometry: creaseAngle is ${creaseAngle}, and it takes how sharp a turn makes a hard edge, in radians, from 0.`);
    }
    const segments = Math.max(arc >= Math.PI * 2 ? 3 : Math.ceil((3 * arc) / (Math.PI * 2)), Math.floor(options.segments ?? 32));
    const points = profile.map(({ x, y }) => ({ x, y }));
    const key = options.key ?? [
        `lathe:${segments}:${points.map((point) => `${point.x},${point.y}`).join(';')}`,
        options.startAngle === undefined ? '' : `:from=${startAngle}`,
        options.arc === undefined ? '' : `:arc=${arc}`,
        creaseAngle === null ? '' : `:crease=${creaseAngle}`,
        uvKeyOf(options),
    ].join('');

    return useGeometry(
        'useLatheGeometry',
        key,
        () => buildLathe(points, segments, { startAngle, arc, creaseAngle }),
        {
            kind: 'lathe',
            profile: points,
            segments,
            ...(options.startAngle === undefined ? {} : { startAngle }),
            ...(options.arc === undefined ? {} : { arc }),
            ...(creaseAngle === null ? {} : { creaseAngle }),
            ...uvRecipeOf(options),
        },
        options,
    );
};
