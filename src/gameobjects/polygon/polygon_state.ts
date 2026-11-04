import { atlasFrame } from '../../atlas';
import { TILE_CORNER_FLOATS } from '../../render/shared/tile_corner';
import { triangulateKept } from '../shapes/triangulate';
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
 * Whether the triangles from `(cx, cy)` to each side all turn the same way: the outline can be seen
 * whole from its middle, and a fan from there covers it once.
 */
const fanHolds = (points: ReadonlyArray<{ x: number; y: number }>, cx: number, cy: number): boolean => {
    let way = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        const turn = (a.x - cx) * (b.y - cy) - (a.y - cy) * (b.x - cx);
        if (turn === 0) {
            continue;
        }
        const sign = turn > 0 ? 1 : -1;
        if (way === 0) {
            way = sign;
        } else if (sign !== way) {
            return false;
        }
    }
    return true;
};

/**
 * The shape's triangles, a corner as a map's cell has it (`TILE_CORNER_FLOATS`): where it is, its
 * point of the picture, and the window of the picture it reads from. From the middle (the average of
 * the corners, holding the average of their points of the picture) to each side, while that covers
 * the outline once; cut into ears when it would fold, which an outline hollowed in past its middle
 * does. Written into `into`, grown when it is too small, and the number of numbers written given back.
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
    // Read no nearer its edge than half a texel in, as a map's cell is, so the frame next door in the
    // sheet does not show along the outline. A shape of a plain colour reads the one white texel.
    const texture = polygon.texture;
    const wide = texture !== null && texture.width > 0 ? texture.width : 1;
    const high = texture !== null && texture.height > 0 ? texture.height : 1;
    const wl = offset.x + 0.5 / wide;
    const wt = offset.y + 0.5 / high;
    const wr = Math.max(wl, offset.x + scale.x - 0.5 / wide);
    const wb = Math.max(wt, offset.y + scale.y - 0.5 / high);

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

    const ears = fanHolds(points, cx, cy) ? null : triangulateKept(points);
    const corners = ears === null ? count * 3 : ears.length;
    const needed = corners * TILE_CORNER_FLOATS;
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
        out[o++] = wl;
        out[o++] = wt;
        out[o++] = wr;
        out[o++] = wb;
    };
    if (ears !== null) {
        for (const i of ears) {
            put(points[i].x, points[i].y, uvs[i].x, uvs[i].y);
        }
        return needed;
    }
    // Seen whole from its middle, or crossing itself (which has no ears): a fan, folds showing.
    for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        put(cx, cy, cu, cv);
        put(points[i].x, points[i].y, uvs[i].x, uvs[i].y);
        put(points[next].x, points[next].y, uvs[next].x, uvs[next].y);
    }
    return needed;
};

/** The rectangle the corners fit in, for a filter to measure the shape by. */
const boundsOf = (points: ReadonlyArray<{ x: number; y: number }>): { x: number; y: number; width: number; height: number } | undefined => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            continue;
        }
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    return minX <= maxX ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : undefined;
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
        state.drawn.bounds = undefined;
        return state;
    }
    state.drawn.bounds = boundsOf(polygon.points);
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
    mesh.vertexCount = length / TILE_CORNER_FLOATS;
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
