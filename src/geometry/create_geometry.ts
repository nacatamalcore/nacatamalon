import { getActiveBox, getActiveGame } from '../store';
import { nanoId } from '../utils';
import { computeDetail } from './build/compute_tangents';
import { computeNormals, toFlatShaded } from './build/normals';
import { projectUvs, UV_PROJECTIONS } from './build/project_uvs';
import { boundsOf, colorsFor, positionsOf, uploadGeometry } from './upload_geometry';
import { COLOR_STRIDE, DETAIL_STRIDE, GEOMETRY_STRIDE } from './types/t_geometry';
import type { TRuntimeStore } from '../store';
import type { TGeometry } from './types/t_geometry';
import type { TUvProjection } from './build/project_uvs';

/**
 * A shape given corner by corner: what `createGeometry` makes and `updateGeometry` changes.
 *
 * Every list is flat, a few numbers per corner one after another, and may be a plain array or a
 * typed one.
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TGeometryData = {
    /**
     * Where each corner is: `x, y, z`, three numbers a corner. The only list that has to be there.
     */
    positions: ArrayLike<number>;
    /**
     * Which corners make each triangle, three a triangle, counter-clockwise as seen from the side
     * that is drawn (the front, unless the material's `cull` says otherwise). Left out, every three
     * corners in order are a triangle of their own.
     */
    indices?: ArrayLike<number>;
    /**
     * Which way the surface faces at each corner: `x, y, z`, three numbers a corner. Left out, it is
     * worked out from the triangles, smooth across corners in the same place.
     */
    normals?: ArrayLike<number>;
    /**
     * Where in the picture each corner is: `u, v`, two numbers a corner, `0, 0` the top left. Or the
     * name of a way to work them out from where the corners are, `'planar'`, `'box'`, `'cylinder'` or
     * `'sphere'` (see `TUvProjection`): a corner that two faces want at two places of the picture is
     * split in two then, so the shape can come out with more corners than it was given. Left out,
     * every corner reads the picture's top left.
     */
    uvs?: ArrayLike<number> | TUvProjection;
    /**
     * With `uvs` worked out by name, how many times the picture is laid every unit of the world,
     * rather than stretched once over the shape: `1` a picture each unit, `0.25` one every four. A
     * wall twice as long then has twice the bricks, and shapes side by side carry on each other's.
     * Round an axis (`'cylinder'`, `'sphere'`) it is rounded to whole times, so the seam meets itself.
     */
    uvScale?: number;
    /**
     * The colour painted on each corner: `r, g, b, a` from 0 to 1, four numbers a corner, multiplied
     * with the picture and the tint and smeared across each triangle. Left out, white.
     */
    colors?: ArrayLike<number>;
    /**
     * Every triangle faces its own way, with hard edges between: the faceted look. The facings are
     * worked out from the triangles, so `normals` is not read. Default `false`, smooth.
     */
    flat?: boolean;
};

/**
 * What each shape made by `createGeometry` keeps beside it: the game it belongs to, so it can be
 * changed outside a scene body, and how much room its buffers have, so a change that fits is written
 * in place.
 */
type TOwned = {
    store: TRuntimeStore;
    vertexBytes: number;
    indexBytes: number;
    indexType: 'uint16' | 'uint32';
};

const owned = new WeakMap<TGeometry, TOwned>();

/**
 * How much more room a shape is given when it outgrows its buffers: enough that one that grows a
 * corner at a time is not made again every frame.
 */
const ROOM = 1.5;

/**
 * Says how a list is wrong, or nothing. A list in the wrong amount is a shape that draws as noise,
 * so it is refused with what it should have been.
 */
const checkLength = (hook: string, name: string, list: ArrayLike<number> | undefined, per: number, corners: number): void => {
    if (list === undefined) {
        return;
    }
    if (list.length !== corners * per) {
        throw new Error(`[NacatamalOn] ${hook}: '${name}' has ${list.length} numbers for ${corners} corners, and it takes ${per} a corner (${corners * per}).`);
    }
};

/**
 * The shape as the card takes it: the corners, their facings and picture places woven into one run,
 * the triangles, and the painted colours. Checked first, so a mistake is said in the shape's own terms.
 */
const assemble = (hook: string, data: TGeometryData): { vertices: Float32Array; indices: Uint16Array | Uint32Array; colors: Uint8Array | null } => {
    const { positions } = data;
    if (positions === undefined || positions.length === 0) {
        throw new Error(`[NacatamalOn] ${hook}: 'positions' is empty. Give it three numbers a corner: x, y, z.`);
    }
    if (positions.length % 3 !== 0) {
        throw new Error(`[NacatamalOn] ${hook}: 'positions' has ${positions.length} numbers, and it takes three a corner (x, y, z).`);
    }
    const corners = positions.length / 3;
    checkLength(hook, 'normals', data.normals, 3, corners);
    const projection = typeof data.uvs === 'string' ? data.uvs : null;
    if (projection !== null && !UV_PROJECTIONS.includes(projection)) {
        throw new Error(`[NacatamalOn] ${hook}: 'uvs' is '${projection}', and the ways to work them out are ${UV_PROJECTIONS.map((name) => `'${name}'`).join(', ')}. Or give them, two numbers a corner.`);
    }
    if (projection === null) {
        checkLength(hook, 'uvs', data.uvs as ArrayLike<number> | undefined, 2, corners);
    }
    if (data.uvScale !== undefined) {
        if (projection === null) {
            throw new Error(`[NacatamalOn] ${hook}: 'uvScale' lays a picture worked out by name; give 'uvs' one of ${UV_PROJECTIONS.map((name) => `'${name}'`).join(', ')}.`);
        }
        if (!Number.isFinite(data.uvScale) || data.uvScale <= 0) {
            throw new Error(`[NacatamalOn] ${hook}: 'uvScale' is ${data.uvScale}, and it takes how many times the picture is laid every unit, more than 0.`);
        }
    }
    checkLength(hook, 'colors', data.colors, 4, corners);

    const indexCount = data.indices?.length ?? corners;
    if (indexCount % 3 !== 0) {
        throw new Error(`[NacatamalOn] ${hook}: ${indexCount} ${data.indices === undefined ? 'corners' : 'indices'} do not make whole triangles: it takes three a triangle.`);
    }
    // Wide enough for the corners there are: the narrow kind holds 65535 of them.
    const given = corners > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    for (let i = 0; i < indexCount; i++) {
        const corner = data.indices === undefined ? i : data.indices[i];
        if (!Number.isInteger(corner) || corner < 0 || corner >= corners) {
            throw new Error(`[NacatamalOn] ${hook}: index ${i} is ${corner}, and there are corners 0 to ${corners - 1}.`);
        }
        given[i] = corner;
    }

    const flatPositions = Float32Array.from(positions);
    // Worked out on the corners as given, which are gathered by where they are, so a corner split
    // for the picture below still faces as the one it came from.
    const normals = data.flat === true || data.normals === undefined ? computeNormals(flatPositions, given) : data.normals;

    // The picture places worked out by name, and every corner they split, with which it came from.
    const projected = projection === null ? null : projectUvs(flatPositions, given, projection, data.uvScale);
    const count = projected === null ? corners : projected.source.length;
    const from = (c: number): number => (projected === null ? c : projected.source[c]);
    const uvs = projected === null ? (data.uvs as ArrayLike<number> | undefined) : projected.uvs;
    let indices: Uint16Array | Uint32Array = given;
    if (projected !== null) {
        indices = count > 65535 ? projected.indices : Uint16Array.from(projected.indices);
    }

    const vertices = new Float32Array(count * GEOMETRY_STRIDE);
    for (let c = 0; c < count; c++) {
        const at = c * GEOMETRY_STRIDE;
        const was = from(c);
        vertices[at] = flatPositions[was * 3];
        vertices[at + 1] = flatPositions[was * 3 + 1];
        vertices[at + 2] = flatPositions[was * 3 + 2];
        vertices[at + 3] = normals[was * 3];
        vertices[at + 4] = normals[was * 3 + 1];
        vertices[at + 5] = normals[was * 3 + 2];
        vertices[at + 6] = uvs === undefined ? 0 : uvs[c * 2];
        vertices[at + 7] = uvs === undefined ? 0 : uvs[c * 2 + 1];
    }

    let colors: Uint8Array | null = null;
    if (data.colors !== undefined) {
        colors = new Uint8Array(count * COLOR_STRIDE);
        for (let c = 0; c < count; c++) {
            const was = from(c);
            for (let k = 0; k < COLOR_STRIDE; k++) {
                colors[c * COLOR_STRIDE + k] = Math.round(Math.min(Math.max(data.colors[was * COLOR_STRIDE + k], 0), 1) * 255);
            }
        }
    }

    if (data.flat === true) {
        const split = toFlatShaded(vertices, indices, null, colors);
        return { vertices: split.vertices, indices: split.indices, colors: split.colors };
    }
    return { vertices, indices, colors };
};

/**
 * Lets the card have back what a shape held, and takes it out of the game's shapes. A mesh still
 * wearing it after that draws nothing rather than reading memory that is gone.
 */
const release = (geometry: TGeometry): void => {
    const held = owned.get(geometry);
    if (held === undefined) {
        return;
    }
    owned.delete(geometry);
    const renderer = held.store.get('screen').renderer;
    for (const buffer of [geometry.vertexBuffer, geometry.indexBuffer, geometry.colorBuffer, geometry.detailBuffer, geometry.skinBuffer]) {
        if (buffer !== null) {
            renderer.destroyBuffer(buffer);
        }
    }
    geometry.vertexBuffer = null;
    geometry.indexBuffer = null;
    geometry.colorBuffer = null;
    geometry.detailBuffer = null;
    geometry.skinBuffer = null;
    geometry.indexCount = 0;
    geometry.vertexCount = 0;
    const shapes = held.store.get('assets').geometries;
    if (shapes.get(geometry.key) === geometry) {
        shapes.delete(geometry.key);
    }
};

/**
 * Makes a shape of your own, corner by corner: a terrain from a height map, a trail, a ramp, a
 * star pushed out into a solid, anything the shape hooks do not make. Hand it to `createMesh`.
 *
 * Only `positions` has to be there. Without `indices`, every three corners are a triangle; without
 * `normals`, the facings are worked out from the triangles, smooth, or one per triangle with `flat`;
 * without `uvs`, every corner reads the picture's top left; without `colors`, white. `uvs` can also
 * be worked out by name, `'box'` for a rock or a building, `'planar'` for a terrain, `'cylinder'`
 * or `'sphere'`, with `uvScale` to lay the picture by the world's units rather than once over it.
 *
 * **It belongs to the object that made it.** Unlike a shape hook's, which every object asking for the
 * same size shares, this one is the object's own: it goes when the object goes, and a mesh elsewhere
 * still wearing it then draws nothing. Change it while the game runs with `updateGeometry`.
 *
 * A shape made this way cannot be written in a scene document, since it is not a recipe but the
 * corners themselves: make it in code, in the body of the object that wears it.
 *
 * @param data Its corners, and whatever else it has of them.
 * @returns The shape, to hand to `createMesh`.
 *
 * @example
 * ```ts
 * const Level = () => {
 *     useCamera3d({ projection: 'perspective', transform: { y: 1, z: 4 } });
 *     useDirectionalLight({ intensity: 1 });
 *
 *     // A ramp: four corners and two triangles, counter-clockwise from the side that is seen.
 *     const ramp = createGeometry({
 *         positions: [-1, 0, 1, 1, 0, 1, 1, 1, -1, -1, 1, -1],
 *         indices: [0, 1, 2, 0, 2, 3],
 *         uvs: [0, 1, 1, 1, 1, 0, 0, 0],
 *     });
 *     createMesh({ geometry: ramp, tint: '#ff9e3d' });
 *
 *     return createScene();
 * };
 * ```
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createGeometry = (data: TGeometryData): TGeometry => {
    const store = getActiveGame();
    const box = getActiveBox();
    if (store === null || box === null) {
        throw new Error('[NacatamalOn] createGeometry: call it inside a scene body, or inside something created with useSpawn.');
    }
    const built = assemble('createGeometry', data);
    const geometry = uploadGeometry(store, `geometry:${nanoId()}`, built, null);
    owned.set(geometry, {
        store,
        vertexBytes: built.vertices.byteLength,
        indexBytes: built.indices.byteLength,
        indexType: geometry.indexType,
    });
    box.cleanups.push(() => release(geometry));
    return geometry;
};

/**
 * Changes a shape made by `createGeometry` while the game runs: a terrain being dug, water worked
 * out on this side, a trail behind a ship, a rope or a cloth. Give it the shape again, whole, as
 * `createGeometry` took it; what is left out is worked out again the same way, and picture places
 * asked for by name are worked out again from where the corners are now.
 *
 * It is written over what the card already holds while it fits, and in new room when it grows past
 * it, with some to spare so a shape that grows a little each frame is not made again each frame.
 * Every mesh wearing it shows the change on the next frame. Call it anywhere, a `useUpdate` included.
 *
 * Only for a shape of your own: one from a shape hook is shared by every object that asked for the
 * same size, so changing it would change all of them, and it is refused.
 *
 * @param geometry The shape `createGeometry` made.
 * @param data Its corners now, and whatever else it has of them.
 *
 * @example
 * ```ts
 * const Sea = () => {
 *     const size = 32;
 *     const positions = new Float32Array(size * size * 3);
 *     const indices: number[] = [];
 *     for (let z = 0; z < size - 1; z++) {
 *         for (let x = 0; x < size - 1; x++) {
 *             const a = z * size + x;
 *             indices.push(a, a + size, a + 1, a + 1, a + size, a + size + 1);
 *         }
 *     }
 *     const wave = (time: number) => {
 *         for (let i = 0; i < size * size; i++) {
 *             const x = (i % size) - size / 2;
 *             const z = Math.floor(i / size) - size / 2;
 *             positions.set([x, Math.sin(x * 0.4 + time) * 0.5, z], i * 3);
 *         }
 *         return { positions, indices };
 *     };
 *     const sea = createGeometry(wave(0));
 *     createMesh({ geometry: sea, tint: '#3d7bff' });
 *
 *     let time = 0;
 *     useUpdate((delta) => {
 *         time += delta;
 *         updateGeometry(sea, wave(time));
 *     });
 * };
 * ```
 *
 * @category Geometry
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const updateGeometry = (geometry: TGeometry, data: TGeometryData): void => {
    const held = owned.get(geometry);
    if (held === undefined) {
        throw new Error(
            `[NacatamalOn] updateGeometry: '${geometry.key}' was not made by createGeometry, or the object that made it is gone. ` +
            'A shape hook\'s shape is shared by every object asking for the same size, so it is not changed: make one of your own with createGeometry.',
        );
    }
    const built = assemble('updateGeometry', data);
    const renderer = held.store.get('screen').renderer;
    const colors = colorsFor(built.vertices.length / GEOMETRY_STRIDE, built.colors);
    const detail = computeDetail(built.vertices, built.indices);
    const indexType = built.indices instanceof Uint32Array ? 'uint32' : 'uint16';

    const fits = built.vertices.byteLength <= held.vertexBytes && built.indices.byteLength <= held.indexBytes && indexType === held.indexType;
    if (fits && geometry.vertexBuffer !== null && geometry.indexBuffer !== null && geometry.colorBuffer !== null && geometry.detailBuffer !== null) {
        renderer.updateBuffer(geometry.vertexBuffer, built.vertices);
        renderer.updateBuffer(geometry.indexBuffer, built.indices);
        renderer.updateBuffer(geometry.colorBuffer, colors);
        renderer.updateBuffer(geometry.detailBuffer, detail);
    } else {
        // Every buffer made again, the corners' too, even when only one outgrew its room: WebGL2
        // remembers which runs a shape is read from by its corners' buffer, and a new one is what
        // tells it to look again.
        for (const buffer of [geometry.vertexBuffer, geometry.indexBuffer, geometry.colorBuffer, geometry.detailBuffer]) {
            if (buffer !== null) {
                renderer.destroyBuffer(buffer);
            }
        }
        // Room for more corners and triangles than now, so one that grows a little does not ask again.
        const cornerCount = built.vertices.length / GEOMETRY_STRIDE;
        const roomCorners = Math.ceil(cornerCount * ROOM);
        const roomIndices = Math.ceil(built.indices.length * ROOM);
        const vertices = new Float32Array(roomCorners * GEOMETRY_STRIDE);
        vertices.set(built.vertices);
        const indices = indexType === 'uint32' ? new Uint32Array(roomIndices) : new Uint16Array(roomIndices);
        indices.set(built.indices);
        const roomyColors = new Uint32Array(roomCorners);
        roomyColors.set(colors);
        const roomyDetail = new Float32Array(roomCorners * DETAIL_STRIDE);
        roomyDetail.set(detail);
        geometry.vertexBuffer = renderer.createBuffer(vertices, 'vertex');
        geometry.indexBuffer = renderer.createBuffer(indices, 'index');
        geometry.colorBuffer = renderer.createBuffer(roomyColors, 'vertex');
        geometry.detailBuffer = renderer.createBuffer(roomyDetail, 'vertex');
        held.vertexBytes = vertices.byteLength;
        held.indexBytes = indices.byteLength;
        held.indexType = indexType;
    }

    geometry.indexType = indexType;
    geometry.vertexCount = built.vertices.length / GEOMETRY_STRIDE;
    geometry.indexCount = built.indices.length;
    geometry.bounds = boundsOf(built.vertices);
    geometry.positions = positionsOf(built.vertices);
    geometry.indices = built.indices;
};
