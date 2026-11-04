import { asColor, asRecord } from '../../utils';
import { shapeColor } from './shape_color';
import type { TColor } from '../../color';
import type { TShape, TShapeStroke } from './types/t_shapes';

const WHITE: TColor = { r: 1, g: 1, b: 1, a: 1 };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const pointsOf = (value: unknown): Array<{ x: number; y: number }> | null => {
    if (!Array.isArray(value)) {
        return null;
    }
    const points: Array<{ x: number; y: number }> = [];
    for (const raw of value) {
        const point = asRecord(raw);
        if (point === null || !finite(point.x) || !finite(point.y)) {
            return null;
        }
        points.push({ x: point.x, y: point.y });
    }
    return points;
};

/**
 * A colour as a document may have it: `{ r, g, b, a }` as the engine writes it, or as `getColor`
 * reads one (`'#ff6b1a'`, `'tomato'`), which is what a scene written by hand or by a tool has.
 * `undefined` for what is no colour.
 */
const colorIn = (value: unknown): TColor | undefined => {
    if (typeof value === 'object' && value !== null) {
        return asColor(value, WHITE);
    }
    return shapeColor(value) ?? undefined;
};

const strokeOf = (value: unknown): TShapeStroke | null => {
    const raw = asRecord(value);
    const color = raw === null ? undefined : colorIn(raw.color);
    if (raw === null || !finite(raw.width) || color === undefined) {
        return null;
    }
    return {
        width: raw.width,
        color,
        ...(raw.join === 'miter' || raw.join === 'round' || raw.join === 'bevel' ? { join: raw.join } : {}),
        ...(raw.cap === 'butt' || raw.cap === 'round' || raw.cap === 'square' ? { cap: raw.cap } : {}),
        ...(raw.align === 'center' || raw.align === 'inside' || raw.align === 'outside' ? { align: raw.align } : {}),
    };
};

const numbers = (raw: Record<string, unknown>, names: readonly string[]): Record<string, number> | null => {
    const out: Record<string, number> = {};
    for (const name of names) {
        if (!finite(raw[name])) {
            return null;
        }
        out[name] = raw[name] as number;
    }
    return out;
};

const optionalNumbers = (raw: Record<string, unknown>, names: readonly string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const name of names) {
        if (finite(raw[name])) {
            out[name] = raw[name] as number;
        }
    }
    return out;
};

/**
 * One shape as a scene document writes it, read back: what it is, where, and its colours as
 * `{ r, g, b, a }`. `null` for one that is not a shape or misses what it cannot be drawn without
 * (a rectangle's size, a circle's radius, a line's points).
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readShape = (value: unknown): TShape | null => {
    const raw = asRecord(value);
    if (raw === null) {
        return null;
    }
    // A fill or a stroke written but unreadable is a shape that cannot be drawn as it was meant.
    const fill = raw.fill === undefined || raw.fill === null ? undefined : colorIn(raw.fill);
    const stroke = raw.stroke === undefined || raw.stroke === null ? null : strokeOf(raw.stroke);
    if ((raw.fill !== undefined && raw.fill !== null && fill === undefined) || (raw.stroke !== undefined && raw.stroke !== null && stroke === null)) {
        return null;
    }
    const look = {
        ...(raw.visible === false ? { visible: false } : {}),
        ...(fill !== undefined ? { fill } : {}),
        ...(stroke !== null ? { stroke } : {}),
    };
    switch (raw.type) {
        case 'rect': {
            const size = numbers(raw, ['x', 'y', 'width', 'height']);
            if (size === null) {
                return null;
            }
            const radius = finite(raw.radius)
                ? raw.radius
                : Array.isArray(raw.radius) && raw.radius.length === 4 && raw.radius.every(finite)
                    ? [raw.radius[0], raw.radius[1], raw.radius[2], raw.radius[3]] as [number, number, number, number]
                    : undefined;
            return {
                type: 'rect',
                x: size.x!, y: size.y!, width: size.width!, height: size.height!,
                ...(radius !== undefined ? { radius } : {}),
                ...optionalNumbers(raw, ['rotation']),
                ...look,
            };
        }
        case 'circle': {
            const size = numbers(raw, ['x', 'y', 'radius']);
            return size === null ? null : {
                type: 'circle',
                x: size.x!, y: size.y!, radius: size.radius!,
                ...optionalNumbers(raw, ['start', 'end', 'segments']),
                ...look,
            };
        }
        case 'ellipse': {
            const size = numbers(raw, ['x', 'y', 'radiusX', 'radiusY']);
            return size === null ? null : {
                type: 'ellipse',
                x: size.x!, y: size.y!, radiusX: size.radiusX!, radiusY: size.radiusY!,
                ...optionalNumbers(raw, ['rotation', 'start', 'end', 'segments']),
                ...look,
            };
        }
        case 'polygon': {
            // As many corners as it was written with: one of two, outlined, is still a line drawn.
            const points = pointsOf(raw.points);
            return points === null ? null : { type: 'polygon', points, ...look };
        }
        case 'line': {
            const points = pointsOf(raw.points);
            const stroke = strokeOf(raw.stroke);
            if (points === null || points.length < 1 || stroke === null) {
                return null;
            }
            return {
                type: 'line',
                points,
                stroke,
                ...(raw.closed === true ? { closed: true } : {}),
                ...(raw.visible === false ? { visible: false } : {}),
            };
        }
        default:
            return null;
    }
};

const colorDoc = (option: unknown): TColor | null => {
    const color = shapeColor(option);
    return color === null ? null : { r: color.r, g: color.g, b: color.b, a: color.a };
};

const strokeDoc = (stroke: TShapeStroke, color: TColor): TShapeStroke => ({
    width: stroke.width,
    color,
    ...(stroke.join !== undefined ? { join: stroke.join } : {}),
    ...(stroke.cap !== undefined ? { cap: stroke.cap } : {}),
    ...(stroke.align !== undefined ? { align: stroke.align } : {}),
});

/**
 * One shape as a scene document writes it: only what a shape has (nothing the game hung on it), its
 * colours as `{ r, g, b, a }` however they were written. `null` for what is not a shape, which the
 * document leaves out.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const writeShape = (shape: TShape): TShape | null => {
    if (shape === null || typeof shape !== 'object') {
        return null;
    }
    // A colour that is none is not drawn, and so not written: the part goes, the shape stays.
    const fill = shape.type !== 'line' && shape.fill !== undefined && shape.fill !== null ? colorDoc(shape.fill) : null;
    // A stroke is written when it is drawn: a colour that is one, and a width that is a number.
    const lineColor = shape.stroke !== undefined && shape.stroke !== null && typeof shape.stroke === 'object' && finite(shape.stroke.width)
        ? colorDoc(shape.stroke.color)
        : null;
    const look = {
        ...(shape.visible === false ? { visible: false } : {}),
        ...(fill !== null ? { fill } : {}),
        ...(shape.type !== 'line' && lineColor !== null ? { stroke: strokeDoc(shape.stroke!, lineColor) } : {}),
    };
    const pointsDoc = (points: unknown): Array<{ x: number; y: number }> =>
        (Array.isArray(points) ? points : [])
            .filter((p): p is { x: number; y: number } => p !== null && typeof p === 'object' && finite(p.x) && finite(p.y))
            .map((p) => ({ x: p.x, y: p.y }));
    const turn = (value: number | undefined): { rotation?: number } => (value !== undefined && value !== 0 ? { rotation: value } : {});
    const slice = (start: number | undefined, end: number | undefined, segments: number | undefined) => ({
        ...(start !== undefined ? { start } : {}),
        ...(end !== undefined ? { end } : {}),
        ...(segments !== undefined ? { segments } : {}),
    });
    switch (shape.type) {
        case 'rect':
            return {
                type: 'rect', x: shape.x, y: shape.y, width: shape.width, height: shape.height,
                ...(shape.radius !== undefined ? { radius: typeof shape.radius === 'number' ? shape.radius : [...shape.radius] as [number, number, number, number] } : {}),
                ...turn(shape.rotation),
                ...look,
            };
        case 'circle':
            return { type: 'circle', x: shape.x, y: shape.y, radius: shape.radius, ...slice(shape.start, shape.end, shape.segments), ...look };
        case 'ellipse':
            return {
                type: 'ellipse', x: shape.x, y: shape.y, radiusX: shape.radiusX, radiusY: shape.radiusY,
                ...turn(shape.rotation),
                ...slice(shape.start, shape.end, shape.segments),
                ...look,
            };
        case 'polygon':
            return { type: 'polygon', points: pointsDoc(shape.points), ...look };
        case 'line':
            if (lineColor === null) {
                return null;
            }
            return {
                type: 'line',
                points: pointsDoc(shape.points),
                stroke: strokeDoc(shape.stroke, lineColor),
                ...(shape.closed === true ? { closed: true } : {}),
                ...(shape.visible === false ? { visible: false } : {}),
            };
        default:
            return null;
    }
};
