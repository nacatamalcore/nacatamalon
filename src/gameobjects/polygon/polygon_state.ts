import { atlasFrame } from '../../atlas';
import type { IRenderer } from '../../render';
import type { TDrawnLayer, TTileMesh } from '../tilemap/layer_state';
import type { TPolygon } from './types/t_polygon';

/**
 * What a shape has on the graphics card, kept beside the record as a map layer's is, and for the
 * same reason: a record is plain data, and a buffer is not.
 *
 * It reaches the backend as a map layer of its own triangles. A layer is already a sheet drawn
 * through triangles in the game's pixels, looked at through the scene's camera, coloured and
 * placed, which is everything a shape needs: one more way of drawing would be one more thing for
 * each backend to get right.
 */
type TPolygonState = {
    mesh: TTileMesh;
    /**
     * The corners as the card takes them, reused from frame to frame.
     */
    corners: Float32Array;
    drawn: TDrawnLayer;
};

const states = new WeakMap<TPolygon, TPolygonState>();

/**
 * The shape's state, made the first time it is drawn.
 *
 * @internal
 */
export const openPolygonState = (polygon: TPolygon): TPolygonState => {
    let state = states.get(polygon);
    if (state === undefined) {
        const mesh: TTileMesh = { buffer: null, vertexCount: 0, capacity: 0 };
        state = {
            mesh,
            corners: new Float32Array(0),
            drawn: { type: 'tilemap', transform: polygon.transform, meshes: [mesh], texture: null, tint: polygon.tint },
        };
        states.set(polygon, state);
    }
    return state;
};

/**
 * Which point of the picture each corner holds when it is stretched over `points` whole: the box
 * the outline fits in is the picture.
 *
 * @internal
 */
export const uvsFitting = (points: ReadonlyArray<{ x: number; y: number }>): Array<{ x: number; y: number }> => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    const width = maxX - minX || 1;
    const height = maxY - minY || 1;
    return points.map((p) => ({ x: (p.x - minX) / width, y: (p.y - minY) / height }));
};

/**
 * The shape's triangles, `x, y, u, v` a corner: from the middle (the average of the corners, holding
 * the average of their points of the picture) to each side. Written into `into`, grown when it is
 * too small, and the number of numbers written given back.
 *
 * @internal
 */
export const writePolygonCorners = (polygon: TPolygon, into: { corners: Float32Array }): number => {
    const points = polygon.points;
    const count = points.length;
    if (count < 3) {
        return 0;
    }
    if (polygon.uvs.length !== count) {
        polygon.uvs = uvsFitting(points);
    }
    const uvs = polygon.uvs;

    // One frame of a sheet: the points of the picture are points of that frame.
    let offset = { x: 0, y: 0 };
    let scale = { x: 1, y: 1 };
    if (polygon.atlas !== undefined && polygon.atlas.frames > 0) {
        const frame = atlasFrame(polygon.atlas, Math.min(polygon.frame ?? 0, polygon.atlas.frames - 1));
        offset = frame.uvOffset;
        scale = frame.uvScale;
    }

    let cx = 0;
    let cy = 0;
    let cu = 0;
    let cv = 0;
    for (let i = 0; i < count; i++) {
        cx += points[i].x;
        cy += points[i].y;
        cu += uvs[i].x;
        cv += uvs[i].y;
    }
    cx /= count;
    cy /= count;
    cu /= count;
    cv /= count;

    const needed = count * 3 * 4;
    if (into.corners.length < needed) {
        into.corners = new Float32Array(needed * 2);
    }
    const out = into.corners;
    let o = 0;
    const put = (x: number, y: number, u: number, v: number): void => {
        out[o++] = x;
        out[o++] = y;
        out[o++] = offset.x + u * scale.x;
        out[o++] = offset.y + v * scale.y;
    };
    for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        put(cx, cy, cu, cv);
        put(points[i].x, points[i].y, uvs[i].x, uvs[i].y);
        put(points[next].x, points[next].y, uvs[next].x, uvs[next].y);
    }
    return needed;
};

/**
 * Builds the shape's triangles and sends them up, reusing the memory while they fit.
 *
 * @internal
 */
export const uploadPolygon = (renderer: IRenderer, polygon: TPolygon): TPolygonState => {
    const state = openPolygonState(polygon);
    const length = writePolygonCorners(polygon, state);
    const mesh = state.mesh;
    if (length === 0) {
        mesh.vertexCount = 0;
        return state;
    }
    const data = state.corners.subarray(0, length);
    if (mesh.buffer === null || length > mesh.capacity) {
        if (mesh.buffer !== null) {
            renderer.destroyBuffer(mesh.buffer);
        }
        // Room for some more corners than now, so a shape that grows a little does not ask again.
        const room = new Float32Array(Math.max(length, state.corners.length));
        room.set(data);
        mesh.buffer = renderer.createBuffer(room, 'vertex');
        mesh.capacity = room.length;
    } else {
        renderer.updateBuffer(mesh.buffer, data);
    }
    mesh.vertexCount = length / 4;
    return state;
};

/**
 * Lets go of what the shape put on the graphics card.
 *
 * @internal
 */
export const releasePolygon = (renderer: IRenderer, polygon: TPolygon): void => {
    const state = states.get(polygon);
    if (state === undefined) {
        return;
    }
    if (state.mesh.buffer !== null) {
        renderer.destroyBuffer(state.mesh.buffer);
    }
    state.mesh.buffer = null;
    state.mesh.vertexCount = 0;
    state.mesh.capacity = 0;
};
