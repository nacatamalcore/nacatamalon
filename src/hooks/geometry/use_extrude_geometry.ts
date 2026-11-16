import { buildExtrude } from '../../geometry/shapes/extrude';
import { checkOutline } from '../../geometry/build/outline';
import { useGeometry, uvKeyOf, uvRecipeOf } from './use_geometry';
import type { TGeometryUvOptions } from '../../geometry/build/project_uvs';
import type { TGeometry } from '../../geometry';

/**
 * What useExtrudeGeometry can be asked for.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TExtrudeGeometryOptions = TGeometryUvOptions & {
    /**
     * The flat outline, its points in order round it, either way: `x` across and `y` up, as the
     * front face is seen. At least three, not crossing itself. A notch or a hollow is drawn in it.
     */
    outline: ReadonlyArray<{ x: number; y: number }>;
    /**
     * Outlines cut out of it, right through: the window of a frame, the middle of a ring, the
     * insides of an "O". Each inside the outline with some of the solid all round it, and none
     * meeting another.
     */
    holes?: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>;
    /**
     * How deep it is pushed out, front to back, centred on `z = 0`. Default `1`.
     */
    depth?: number;
    /**
     * The edges between its faces and its sides cut off, `size` in from both: the solid still fills
     * the outline by `depth`, and its faces are smaller by `size`. `segments` is in how many steps,
     * `1` a straight cut at 45° and more a rounder one; default `3`. Left out, the edges are sharp.
     * At most half the depth, and narrower than the outline is at its narrowest.
     */
    bevel?: { size: number; segments?: number };
    /**
     * How sharply, in radians, the outline has to turn at a point for the sides to meet there in a
     * hard edge rather than round smoothly: a diamond's corners are hard, a circle given in points
     * is round. Default `Math.PI / 6`, 30°.
     */
    creaseAngle?: number;
    /**
     * What to keep it under. By default everything it is asked for is the name, so two the same are
     * the same shape. Give one only to have a friendlier name: a name already taken gives back that
     * shape, whatever is asked.
     */
    key?: string;
};

const DEFAULT_CREASE = Math.PI / 6;

const pointsKey = (points: ReadonlyArray<{ x: number; y: number }>): string => points.map((p) => `${p.x},${p.y}`).join(';');

/**
 * A flat outline pushed out into a solid, as a cookie cutter goes through dough: a diamond, a star,
 * a letter, a gear, a notched separator, a deflector, a frame with its window cut out. Draw the
 * outline in points, say how deep, and round its edges off with a bevel if they should not be sharp.
 *
 * ```
 *  the outline       what it makes
 *     ●                 /\
 *   ●   ●     →        /  \|
 *     ●                \  /|
 *                       \/ /
 * ```
 *
 * It stands as the outline is drawn, `x` across and `y` up, pushed out `depth` along `z` and centred
 * on its middle: its front face looks at a camera on `+z`. Asking for the same outline twice gives
 * back the same shape, so a wheel of thirty-seven separators costs one shape.
 *
 * **Its picture** is laid once over each face, by the box round the outline, upright as each face is
 * seen; and once round the sides, along the outline (`u`) and from the front to the back (`v`). Give
 * `uvs: 'box'` and `uvScale` to lay it by the world's units instead.
 *
 * @param options The outline, its holes, how deep and how its edges are cut.
 * @returns The shape, ready to be shown.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 3 } });
 *     useDirectionalLight({ intensity: 1 });
 *
 *     // A diamond with its edges rounded off.
 *     const diamond = useExtrudeGeometry({
 *         outline: [{ x: 0, y: 0.5 }, { x: 0.3, y: 0 }, { x: 0, y: -0.5 }, { x: -0.3, y: 0 }],
 *         depth: 0.1,
 *         bevel: { size: 0.02, segments: 2 },
 *     });
 *     createMesh({ geometry: diamond, tint: '#e8c547' });
 *
 *     // A frame: a square with a square window.
 *     const frame = useExtrudeGeometry({
 *         outline: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }],
 *         holes: [[{ x: -0.7, y: -0.7 }, { x: 0.7, y: -0.7 }, { x: 0.7, y: 0.7 }, { x: -0.7, y: 0.7 }]],
 *         depth: 0.2,
 *     });
 *     createMesh({ geometry: frame, tint: '#8a5a33', transform: { x: 2 } });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useExtrudeGeometry = (options: TExtrudeGeometryOptions): TGeometry => {
    const hook = 'useExtrudeGeometry';
    const { outline, holes } = checkOutline(hook, options?.outline, options?.holes ?? []);
    const depth = options.depth ?? 1;
    if (!Number.isFinite(depth) || depth <= 0) {
        throw new Error(`[NacatamalOn] ${hook}: depth is ${depth}, and it takes how deep the outline is pushed out, above 0.`);
    }
    let bevel: { size: number; segments: number } | null = null;
    if (options.bevel !== undefined) {
        const size = options.bevel?.size;
        if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || size > depth / 2) {
            throw new Error(`[NacatamalOn] ${hook}: bevel.size is ${String(size)}, and it takes how far in the edges are cut, above 0 and at most half the depth (${depth / 2}).`);
        }
        const segments = options.bevel.segments ?? 3;
        if (!Number.isFinite(segments) || segments < 1) {
            throw new Error(`[NacatamalOn] ${hook}: bevel.segments is ${String(segments)}, and it takes in how many steps the edges are cut, 1 or more.`);
        }
        bevel = { size, segments: Math.floor(segments) };
    }
    const creaseAngle = options.creaseAngle ?? DEFAULT_CREASE;
    if (!Number.isFinite(creaseAngle) || creaseAngle < 0) {
        throw new Error(`[NacatamalOn] ${hook}: creaseAngle is ${creaseAngle}, and it takes how sharp a turn makes a hard edge, in radians, from 0.`);
    }

    // As given, so the key and the recipe say what was asked rather than how it was turned round.
    const given = options.outline.map(({ x, y }) => ({ x, y }));
    const givenHoles = (options.holes ?? []).map((hole) => hole.map(({ x, y }) => ({ x, y })));
    const key = options.key ?? [
        `extrude:${depth}:${pointsKey(given)}`,
        givenHoles.map((hole) => `|${pointsKey(hole)}`).join(''),
        bevel === null ? '' : `:bevel=${bevel.size}/${bevel.segments}`,
        options.creaseAngle === undefined ? '' : `:crease=${creaseAngle}`,
        uvKeyOf(options),
    ].join('');

    return useGeometry(
        hook,
        key,
        () => buildExtrude(hook, outline, holes, depth, bevel, creaseAngle),
        {
            kind: 'extrude',
            outline: given,
            ...(givenHoles.length > 0 ? { holes: givenHoles } : {}),
            depth,
            ...(bevel === null ? {} : { bevel }),
            ...(options.creaseAngle === undefined ? {} : { creaseAngle }),
            ...uvRecipeOf(options),
        },
        options,
    );
};
