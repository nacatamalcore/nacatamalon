import { TILE_CORNER_FLOATS } from '../../render/shared/tile_corner';
import { ellipsePoints, rectPoints, sidesFor, sweepOf } from './curves';
import { strokePath } from './stroke';
import { triangulateKept } from './triangulate';
import { describeColor, shapeColor } from './shape_color';
import type { TColor } from '../../color';
import type { IRenderer } from '../../render';
import type { TDrawTexture } from '../../render/interface';
import type { TDrawnLayer, TTileMesh } from '../tilemap/layer_state';
import type { TShape, TShapeStroke, TShapes } from './types/t_shapes';
import type { TEmitTriangle, TStrokeLook } from './stroke';

type TPoint = { x: number; y: number };

/**
 * The colours a set of shapes uses, one texel each, in a picture of its own. Each corner of a shape
 * points at the middle of its colour's texel, which is how one map layer, one picture and one tint
 * draws shapes of as many colours as there are.
 */
type TPalette = {
    bytes: Uint8Array;
    width: number;
    height: number;
    texture: TDrawTexture | null;
};

/**
 * What a set of shapes has on the graphics card, kept beside the record as a polygon's is.
 */
type TShapesState = {
    mesh: TTileMesh;
    corners: Float32Array;
    palette: TPalette;
    drawn: TDrawnLayer;
};

const states = new WeakMap<TShapes, TShapesState>();

/**
 * The most colours a row of the palette holds; past it, more rows.
 */
const ROW = 256;

/**
 * The colours that are none each set of shapes was already warned about, so each typo is said once
 * and not every frame, and a second one is said too.
 */
const warned = new WeakMap<TShapes, Set<string>>();
const SAID_MOST = 8;

/**
 * The colour a part of a shape is drawn in, or `null` when it is not drawn: no fill, no stroke, or a
 * colour that is none, said once.
 */
const partColor = (shapes: TShapes, at: number, option: unknown, part: 'fill' | 'stroke'): TColor | null => {
    const color = shapeColor(option);
    if (color === null) {
        const written = describeColor(option);
        let said = warned.get(shapes);
        if (said === undefined) {
            said = new Set();
            warned.set(shapes, said);
        }
        // Each one said once, and no more than a few for one set of shapes: a colour worked out wrong
        // every frame would otherwise be said every frame.
        if (said.has(written) || said.size >= SAID_MOST) {
            return null;
        }
        said.add(written);
        console.warn(`[NacatamalOn] createShapes: the ${part} of shape ${at} is not a colour (${written}), so it is not drawn. Give it one getColor reads, such as '#ff6b1a'.${said.size === SAID_MOST ? ' Any more are not said.' : ''}`);
    }
    return color;
};

/** What a shape is drawn in this frame: each part's colour, or `null` for a part not drawn. */
const colorsOf = (shapes: TShapes, at: number, shape: TShape): { fill: TColor | null; stroke: TColor | null } => ({
    fill: fills(shape) ? partColor(shapes, at, (shape as { fill: unknown }).fill, 'fill') : null,
    stroke: strokes(shape.stroke) ? partColor(shapes, at, shape.stroke.color, 'stroke') : null,
});

const channel = (value: number): number => (Number.isFinite(value) ? Math.round(Math.min(Math.max(value, 0), 1) * 255) : 255);

/** A colour as four bytes in one number, which is what tells two apart. */
const packed = (color: TColor): number =>
    ((channel(color.r) << 24) | (channel(color.g) << 16) | (channel(color.b) << 8) | channel(color.a)) >>> 0;

/**
 * Whether a stroke draws anything.
 */
const strokes = (stroke: TShapeStroke | null | undefined): stroke is TShapeStroke =>
    stroke !== null && stroke !== undefined && Number.isFinite(stroke.width) && stroke.width > 0;

const fills = (shape: TShape): boolean => shape.type !== 'line' && shape.fill !== null && shape.fill !== undefined;

/**
 * The state, made the first time it is drawn.
 *
 * @internal
 */
export const openShapesState = (shapes: TShapes): TShapesState => {
    let state = states.get(shapes);
    if (state === undefined) {
        const mesh: TTileMesh = { buffer: null, vertexCount: 0, capacity: 0 };
        state = {
            mesh,
            corners: new Float32Array(0),
            palette: { bytes: new Uint8Array(0), width: 0, height: 0, texture: null },
            drawn: { type: 'tilemap', transform: shapes.transform, meshes: [mesh], texture: null, tint: shapes.tint, smooth: false },
        };
        states.set(shapes, state);
    }
    return state;
};

/**
 * Where the triangles are being written this frame, and in which colour.
 */
type TWriter = {
    out: Float32Array;
    at: number;
    u: number;
    v: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

const room = (writer: TWriter, floats: number): void => {
    if (writer.at + floats <= writer.out.length) {
        return;
    }
    const grown = new Float32Array(Math.max(writer.out.length * 2, writer.at + floats, 1024));
    grown.set(writer.out.subarray(0, writer.at));
    writer.out = grown;
};

const corner = (writer: TWriter, x: number, y: number): void => {
    const out = writer.out;
    let o = writer.at;
    out[o++] = x;
    out[o++] = y;
    out[o++] = writer.u;
    out[o++] = writer.v;
    // The window is the texel itself: the colour's middle, and nowhere else.
    out[o++] = writer.u;
    out[o++] = writer.v;
    out[o++] = writer.u;
    out[o++] = writer.v;
    writer.at = o;
    if (x < writer.minX) writer.minX = x;
    if (y < writer.minY) writer.minY = y;
    if (x > writer.maxX) writer.maxX = x;
    if (y > writer.maxY) writer.maxY = y;
};

const triangle = (writer: TWriter, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void => {
    if (!Number.isFinite(ax + ay + bx + by + cx + cy)) {
        return;
    }
    room(writer, 3 * TILE_CORNER_FLOATS);
    corner(writer, ax, ay);
    corner(writer, bx, by);
    corner(writer, cx, cy);
};

/** Twice the area an outline closes, signed: which way round it goes. */
const areaOf = (points: ReadonlyArray<TPoint>): number => {
    if (points.length === 0) {
        return 0;
    }
    // From the first corner, so an outline far from the origin keeps its digits.
    const origin = points[0]!;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        area += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
    }
    return area;
};

/**
 * How a stroke is drawn along an outline: on it, or all to one side, the inside being on the left
 * of an outline that goes round with a positive area.
 */
/** What counts as no area for an outline of this size, as `triangulate` counts it. */
const flatFor = (points: ReadonlyArray<TPoint>): number => {
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
    const size = Math.max(maxX - minX, maxY - minY, 0);
    return size * size * 1e-10;
};

const lookOf = (stroke: TShapeStroke, closed: boolean, outline: ReadonlyArray<TPoint>, scale: number): TStrokeLook => {
    const width = stroke.width;
    let left = width / 2;
    let right = width / 2;
    const area = closed && stroke.align !== undefined && stroke.align !== 'center' ? areaOf(outline) : 0;
    // An outline with no inside (two corners, all in a row, but for rounding) has no side to keep
    // to: on it.
    if (Math.abs(area) > flatFor(outline)) {
        const insideLeft = area > 0;
        const toLeft = (stroke.align === 'inside') === insideLeft;
        left = toLeft ? width : 0;
        right = toLeft ? 0 : width;
    }
    return { left, right, join: stroke.join ?? 'miter', cap: stroke.cap ?? 'butt', scale };
};

/** A fan from `(cx, cy)` through the points, closing back to the first when `round`. */
const fanFrom = (emit: TEmitTriangle, cx: number, cy: number, points: ReadonlyArray<TPoint>, round: boolean): void => {
    const last = round ? points.length : points.length - 1;
    for (let i = 0; i < last; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        emit(cx, cy, a.x, a.y, b.x, b.y);
    }
};

/**
 * One shape's outline, and how it is filled: from a point (a circle's middle), by ears, or as a fan
 * from its first corner (a rectangle).
 */
type TOutline = { points: TPoint[]; closed: boolean; centre: TPoint | null };

/**
 * The corners of a list the game wrote, each a point with both numbers: one left `undefined`, or with
 * a number missing, is passed over rather than stopping the frame.
 */
const pointsIn = (points: ReadonlyArray<unknown>): TPoint[] => {
    const real = (p: unknown): p is TPoint =>
        p !== null && typeof p === 'object' && Number.isFinite((p as TPoint).x) && Number.isFinite((p as TPoint).y);
    return points.every(real) ? points as TPoint[] : points.filter(real);
};

const outlineOf = (shape: TShape, scale: number): TOutline | null => {
    switch (shape.type) {
        case 'rect': {
            if (!Number.isFinite(shape.x + shape.y + shape.width + shape.height) || shape.width === 0 || shape.height === 0) {
                return null;
            }
            return { points: rectPoints(shape.x, shape.y, shape.width, shape.height, shape.radius, shape.rotation ?? 0, scale), closed: true, centre: null };
        }
        case 'circle':
        case 'ellipse': {
            const rx = shape.type === 'circle' ? shape.radius : shape.radiusX;
            const ry = shape.type === 'circle' ? shape.radius : shape.radiusY;
            const rotation = shape.type === 'ellipse' ? shape.rotation ?? 0 : 0;
            if (!Number.isFinite(shape.x + shape.y + rx + ry + rotation) || rx <= 0 || ry <= 0) {
                return null;
            }
            const slice = sweepOf(shape.start, shape.end);
            if (slice === null) {
                const sides = sidesFor(Math.max(rx, ry) * scale, Math.PI * 2, shape.segments);
                return { points: ellipsePoints(shape.x, shape.y, rx, ry, rotation, 0, Math.PI * 2, Math.max(3, sides), true), closed: true, centre: { x: shape.x, y: shape.y } };
            }
            const sides = sidesFor(Math.max(rx, ry) * scale, slice.sweep, shape.segments);
            return { points: ellipsePoints(shape.x, shape.y, rx, ry, rotation, slice.from, slice.sweep, sides, false), closed: false, centre: { x: shape.x, y: shape.y } };
        }
        case 'polygon':
            return Array.isArray(shape.points) ? { points: pointsIn(shape.points), closed: true, centre: null } : null;
        case 'line':
            return Array.isArray(shape.points) ? { points: pointsIn(shape.points), closed: shape.closed === true, centre: null } : null;
        default:
            return null;
    }
};

/** Fills a polygon by ears, or from its middle when its sides cross. */
const fillPolygon = (emit: TEmitTriangle, points: ReadonlyArray<TPoint>): void => {
    if (points.length < 3) {
        return;
    }
    const ears = triangulateKept(points);
    if (ears !== null) {
        for (let i = 0; i < ears.length; i += 3) {
            const a = points[ears[i]!]!;
            const b = points[ears[i + 1]!]!;
            const c = points[ears[i + 2]!]!;
            emit(a.x, a.y, b.x, b.y, c.x, c.y);
        }
        return;
    }
    let cx = 0;
    let cy = 0;
    for (const p of points) {
        cx += p.x;
        cy += p.y;
    }
    fanFrom(emit, cx / points.length, cy / points.length, points, true);
};

/**
 * Goes through the shapes as they are now, as they are drawn: for each part, filled or outlined,
 * `paint` with its colour, then its triangles to `emit`. What draws them and what asks whether a
 * point is on them read the same triangles, so the two never disagree.
 *
 * @internal
 */
export const traceShapes = (shapes: TShapes, paint: (color: TColor) => void, emit: TEmitTriangle): void => {
    const list = Array.isArray(shapes.shapes) ? shapes.shapes : [];
    const place = shapes.worldTransform ?? shapes.transform;
    const scale = Math.max(Math.abs(place.scaleX), Math.abs(place.scaleY)) || 1;
    for (let at = 0; at < list.length; at++) {
        const shape = list[at]!;
        if (shape === null || typeof shape !== 'object' || shape.visible === false) {
            continue;
        }
        const colors = colorsOf(shapes, at, shape);
        if (colors.fill === null && colors.stroke === null) {
            continue;
        }
        const outline = outlineOf(shape, scale);
        if (outline === null) {
            continue;
        }
        if (colors.fill !== null) {
            paint(colors.fill);
            if (outline.centre !== null) {
                // A circle, or a slice of one: from its middle.
                fanFrom(emit, outline.centre.x, outline.centre.y, outline.points, outline.closed);
            } else if (shape.type === 'rect') {
                fanFrom(emit, outline.points[0]!.x, outline.points[0]!.y, outline.points.slice(1), false);
            } else {
                fillPolygon(emit, outline.points);
            }
        }
        if (colors.stroke !== null) {
            paint(colors.stroke);
            strokePath(outline.points, outline.closed, lookOf(shape.stroke!, outline.closed, outline.points, scale), emit);
        }
    }
};

/** Points the writer at a colour's texel. */
const paint = (writer: TWriter, palette: TPalette, index: number): void => {
    const column = index % palette.width;
    const row = Math.floor(index / palette.width);
    writer.u = (column + 0.5) / palette.width;
    writer.v = (row + 0.5) / palette.height;
};

const writer: TWriter = { out: new Float32Array(0), at: 0, u: 0, v: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };

const writeTriangle: TEmitTriangle = (ax, ay, bx, by, cx, cy) => triangle(writer, ax, ay, bx, by, cx, cy);

/**
 * The colours the shapes are drawn in, in the order `traceShapes` paints them, without working out
 * a corner.
 */
const traceColors = (shapes: TShapes, paint: (color: TColor) => void): void => {
    const list = Array.isArray(shapes.shapes) ? shapes.shapes : [];
    for (let at = 0; at < list.length; at++) {
        const shape = list[at]!;
        if (shape === null || typeof shape !== 'object' || shape.visible === false) {
            continue;
        }
        const colors = colorsOf(shapes, at, shape);
        if (colors.fill !== null) {
            paint(colors.fill);
        }
        if (colors.stroke !== null) {
            paint(colors.stroke);
        }
    }
};

/**
 * Builds the shapes' triangles as they are now, and their palette, and sends both up, reusing the
 * memory while it fits and the picture while its colours are the same.
 *
 * @internal
 */
export const uploadShapes = (renderer: IRenderer, shapes: TShapes): TShapesState => {
    const state = openShapesState(shapes);

    // First the colours, so the palette's size, and so where each texel is, is known before a corner
    // is written.
    const index = new Map<number, number>();
    const colors: number[] = [];
    traceColors(shapes, (color) => {
        const key = packed(color);
        if (!index.has(key)) {
            index.set(key, colors.length);
            colors.push(key);
        }
    });
    writePalette(renderer, state.palette, colors);

    writer.out = state.corners;
    writer.at = 0;
    writer.minX = Infinity;
    writer.minY = Infinity;
    writer.maxX = -Infinity;
    writer.maxY = -Infinity;
    traceShapes(
        shapes,
        (color) => paint(writer, state.palette, index.get(packed(color))!),
        writeTriangle,
    );
    state.corners = writer.out;
    const length = writer.at;
    writer.out = new Float32Array(0);

    const mesh = state.mesh;
    const drawn = state.drawn;
    drawn.texture = state.palette.texture;
    drawn.bounds = length === 0 ? undefined : { x: writer.minX, y: writer.minY, width: writer.maxX - writer.minX, height: writer.maxY - writer.minY };
    if (length === 0) {
        mesh.vertexCount = 0;
        return state;
    }
    const data = state.corners.subarray(0, length);
    if (mesh.buffer === null || length > mesh.capacity) {
        if (mesh.buffer !== null) {
            renderer.destroyBuffer(mesh.buffer);
        }
        // Room for some more than now, so shapes that grow a little do not ask again.
        const roomy = new Float32Array(Math.max(length, state.corners.length));
        roomy.set(data);
        mesh.buffer = renderer.createBuffer(roomy, 'vertex');
        mesh.capacity = roomy.length;
    } else {
        renderer.updateBuffer(mesh.buffer, data);
    }
    mesh.vertexCount = length / TILE_CORNER_FLOATS;
    return state;
};

/**
 * Writes the colours into the palette's picture: made again only when it has to grow (to the next
 * power of two along a row of 256, then by rows), sent up again only when a colour changed.
 */
const writePalette = (renderer: IRenderer, palette: TPalette, colors: readonly number[]): void => {
    const count = Math.max(1, colors.length);
    // Only ever grown, and by doubling: a shape shown and hidden, or a colour more and then one
    // less, keeps the picture it has and only writes into it.
    let width = palette.width;
    let height = palette.height;
    if (palette.texture === null || count > width * height) {
        width = Math.min(ROW, 2 ** Math.ceil(Math.log2(count)));
        height = Math.ceil(count / width);
    }
    const bytes = new Uint8Array(width * height * 4);
    for (let i = 0; i < colors.length; i++) {
        const key = colors[i]!;
        bytes[i * 4] = key >>> 24;
        bytes[i * 4 + 1] = (key >>> 16) & 255;
        bytes[i * 4 + 2] = (key >>> 8) & 255;
        bytes[i * 4 + 3] = key & 255;
    }
    const sameSize = palette.texture !== null && palette.width === width && palette.height === height;
    if (sameSize && sameBytes(palette.bytes, bytes)) {
        return;
    }
    if (sameSize) {
        renderer.updateDataTexture(palette.texture!.gpu!, bytes, width, height);
    } else {
        if (palette.texture?.gpu) {
            renderer.destroyTexture(palette.texture.gpu);
        }
        palette.texture = { status: 'ready', gpu: renderer.createDataTexture(bytes, width, height), width, height };
    }
    palette.bytes = bytes;
    palette.width = width;
    palette.height = height;
};

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
};

/**
 * Lets go of what the shapes put on the graphics card: their corners and their palette.
 *
 * @internal
 */
export const releaseShapes = (renderer: IRenderer, shapes: TShapes): void => {
    const state = states.get(shapes);
    if (state === undefined) {
        return;
    }
    if (state.mesh.buffer !== null) {
        renderer.destroyBuffer(state.mesh.buffer);
    }
    state.mesh.buffer = null;
    state.mesh.vertexCount = 0;
    state.mesh.capacity = 0;
    if (state.palette.texture?.gpu) {
        renderer.destroyTexture(state.palette.texture.gpu);
    }
    state.palette.texture = null;
    state.palette.bytes = new Uint8Array(0);
    state.palette.width = 0;
    state.palette.height = 0;
    states.delete(shapes);
};
