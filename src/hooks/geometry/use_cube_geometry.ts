import { buildCube } from '../../geometry/shapes/cube';
import type { TCubeBevel } from '../../geometry/shapes/cube';
import { useGeometry, uvKeyOf, uvRecipeOf } from './use_geometry';
import type { TGeometryUvOptions } from '../../geometry/build/project_uvs';
import type { TGeometry } from '../../geometry';

/**
 * What useCubeGeometry can be asked for. Everything is optional.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TCubeGeometryOptions = TGeometryUvOptions & {
    /**
     * Across. Default `1`.
     */
    width?: number;
    /**
     * Up. Default `1`.
     */
    height?: number;
    /**
     * Towards the viewer. Default `1`.
     */
    depth?: number;
    /**
     * Its edges cut off, `size` in from every face: a rounded box, a cushioned table edge, a 3D
     * button, a die. The box still fills `width` by `height` by `depth`, and its faces are smaller
     * by `size` all round. `segments` is in how many steps across each edge, `1` a straight cut at
     * 45° and more a rounder one, with the corners rounded like a ball's; default `3`. Each face
     * takes half of every edge, so a rounded one is cut in an even number of steps: `3` is cut in
     * `4`. Left out, the edges are sharp. At most half the box's smallest side.
     */
    bevel?: { size: number; segments?: number };
    /**
     * What to keep it under. By default every number it is asked for and how its picture is laid are
     * the name, so two that differ in any never get mixed up and two the same are the same shape. Give one only to
     * have a friendlier name: a name already taken gives back that shape, whatever is asked.
     */
    key?: string;
};

/**
 * A cube, or any box shape: as wide, tall and deep as you ask, its edges sharp or cut off with a
 * `bevel`: rounded, or a straight cut.
 *
 * Built and put on the graphics card at once, so it is ready the moment you have it: nothing is
 * fetched and nothing is waited for. Hand it to `createMesh` as its `geometry`.
 *
 * Asking for the same size twice gives back the same shape, so a hundred of them cost one shape and
 * a hundred placements.
 *
 * **Its picture** is laid once on each face, upright as the face is seen from outside, `0, 0` at
 * the face's top left: the sides with up as up, the top as seen from the front (its far edge at
 * the top of the picture), the bottom as seen from below. The same as `uvs: 'box'`; with
 * `uvScale` the picture is laid by the box's units instead, the same size on a box of any size.
 * With a bevel each face's picture reaches round to the middle of its edges, laid by length.
 *
 * @param options Its size, how smooth it is, and what to keep it under.
 * @returns The shape, ready to be shown.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { z: 4 } });
 *     const shape = useCubeGeometry();
 *     createMesh({ geometry: shape });
 *
 *     // A button with its edges rounded off.
 *     const button = useCubeGeometry({ width: 1, height: 0.3, depth: 1, bevel: { size: 0.1 } });
 *     createMesh({ geometry: button, transform: { x: 1.5 } });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const useCubeGeometry = (options: TCubeGeometryOptions = {}): TGeometry => {
    const hook = 'useCubeGeometry';
    const width = options.width ?? 1;
    const height = options.height ?? 1;
    const depth = options.depth ?? 1;
    let bevel: TCubeBevel | null = null;
    if (options.bevel !== undefined) {
        const size = options.bevel?.size;
        const most = Math.min(width, height, depth) / 2;
        if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || size > most) {
            throw new Error(`[NacatamalOn] ${hook}: bevel.size is ${String(size)}, and it takes how far in the edges are cut, above 0 and at most half the box's smallest side (${most}).`);
        }
        const segments = options.bevel.segments ?? 3;
        if (!Number.isFinite(segments) || segments < 1) {
            throw new Error(`[NacatamalOn] ${hook}: bevel.segments is ${String(segments)}, and it takes in how many steps the edges are cut, 1 or more.`);
        }
        bevel = { size, segments: Math.floor(segments) };
    }
    const key = options.key ?? `cube:${width}:${height}:${depth}${bevel === null ? '' : `:bevel=${bevel.size}/${bevel.segments}`}${uvKeyOf(options)}`;

    return useGeometry(
        hook,
        key,
        () => buildCube(width, height, depth, bevel),
        { kind: 'cube', width, height, depth, ...(bevel === null ? {} : { bevel }), ...uvRecipeOf(options) },
        options,
    );
};
