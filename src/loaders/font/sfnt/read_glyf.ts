import type { TOutline, TOutlineSegment } from './t_outline';

/**
 * How deep one glyph may be built out of others. Real fonts go two or three levels; a file that goes
 * further is looping, and is stopped rather than followed for ever.
 */
const MAX_DEPTH = 8;

type TPoint = { x: number; y: number; on: boolean };

/**
 * Turns one loop of points into segments. A point off the curve is a control point; two of them in a
 * row have an on-curve point implied halfway between, which is how TrueType saves space. A loop may
 * even start off the curve, so it is turned to begin at an on-curve point, real or implied.
 */
const contourSegments = (points: readonly TPoint[]): TOutlineSegment[] => {
    const count = points.length;
    if (count < 2) {
        return [];
    }
    const first = points.findIndex((point) => point.on);
    let start: { x: number; y: number };
    let from: number;
    if (first === -1) {
        // Every point is a control point: the loop starts between the first two.
        start = { x: (points[0]!.x + points[1]!.x) / 2, y: (points[0]!.y + points[1]!.y) / 2 };
        from = 1;
    } else {
        start = points[first]!;
        from = first + 1;
    }

    const segments: TOutlineSegment[] = [];
    let pen = start;
    let control: TPoint | null = null;
    for (let step = 0; step < count; step++) {
        const point = points[(from + step) % count]!;
        if (point.on) {
            segments.push(control === null
                ? { kind: 'line', x0: pen.x, y0: pen.y, x1: point.x, y1: point.y }
                : { kind: 'quad', x0: pen.x, y0: pen.y, cx: control.x, cy: control.y, x1: point.x, y1: point.y });
            pen = point;
            control = null;
        } else if (control === null) {
            control = point;
        } else {
            const middle = { x: (control.x + point.x) / 2, y: (control.y + point.y) / 2 };
            segments.push({ kind: 'quad', x0: pen.x, y0: pen.y, cx: control.x, cy: control.y, x1: middle.x, y1: middle.y });
            pen = middle;
            control = point;
        }
    }
    // Back to where it began.
    if (control !== null) {
        segments.push({ kind: 'quad', x0: pen.x, y0: pen.y, cx: control.x, cy: control.y, x1: start.x, y1: start.y });
    } else if (pen.x !== start.x || pen.y !== start.y) {
        segments.push({ kind: 'line', x0: pen.x, y0: pen.y, x1: start.x, y1: start.y });
    }
    // A segment that goes nowhere has no direction, and the distance field needs one from every edge.
    return segments.filter((segment) => segment.x0 !== segment.x1 || segment.y0 !== segment.y1 || segment.kind === 'quad');
};

/**
 * A glyph drawn with its own points: a list of where each loop ends, then the points packed as
 * flags, x moves and y moves.
 */
const simpleGlyph = (view: DataView, at: number, contours: number): TPoint[][] => {
    const ends: number[] = [];
    for (let i = 0; i < contours; i++) ends.push(view.getUint16(at + 10 + i * 2));
    const pointCount = contours > 0 ? ends[contours - 1]! + 1 : 0;
    const instructions = view.getUint16(at + 10 + contours * 2);
    let cursor = at + 12 + contours * 2 + instructions;

    const flags = new Uint8Array(pointCount);
    for (let i = 0; i < pointCount;) {
        const flag = view.getUint8(cursor++);
        flags[i++] = flag;
        // Bit 3: the next byte says how many more times this flag repeats.
        if ((flag & 8) !== 0) {
            let repeat = view.getUint8(cursor++);
            while (repeat-- > 0 && i < pointCount) flags[i++] = flag;
        }
    }

    // Each coordinate is a move from the last: one byte with its sign in the flag, two bytes, or none.
    const read = (short: number, same: number): Int32Array => {
        const values = new Int32Array(pointCount);
        let value = 0;
        for (let i = 0; i < pointCount; i++) {
            const flag = flags[i]!;
            if ((flag & short) !== 0) {
                const step = view.getUint8(cursor++);
                value += (flag & same) !== 0 ? step : -step;
            } else if ((flag & same) === 0) {
                value += view.getInt16(cursor);
                cursor += 2;
            }
            values[i] = value;
        }
        return values;
    };
    const xs = read(2, 16);
    const ys = read(4, 32);

    const loops: TPoint[][] = [];
    let begin = 0;
    for (const end of ends) {
        const loop: TPoint[] = [];
        for (let i = begin; i <= end; i++) loop.push({ x: xs[i]!, y: ys[i]!, on: (flags[i]! & 1) !== 0 });
        loops.push(loop);
        begin = end + 1;
    }
    return loops;
};

/**
 * Reads glyph outlines out of `glyf`, using `loca` to find where each one starts.
 *
 * @internal
 */
export type TGlyfReader = (glyph: number) => TOutline;

/**
 * Builds the reader of a font's glyph outlines.
 *
 * A glyph is either drawn with points of its own or built out of other glyphs, each moved, and maybe
 * scaled or turned: an "é" is often an "e" and an accent. Both come out the same here, as loops of
 * lines and curves, so nothing after this has to know which it was.
 *
 * A glyph with no outline (a space) is an empty list. A glyph whose bytes do not make sense is an
 * empty list too, rather than an error: one broken letter should not stop the rest of the font.
 *
 * @internal
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const readGlyf = (
    glyf: DataView | undefined,
    loca: DataView | undefined,
    glyphCount: number,
    longOffsets: boolean,
): TGlyfReader => {
    if (glyf === undefined || loca === undefined) {
        return () => [];
    }
    const offset = (glyph: number): number => (longOffsets ? loca.getUint32(glyph * 4) : loca.getUint16(glyph * 2) * 2);

    const points = (glyph: number, depth: number): TPoint[][] => {
        if (glyph < 0 || glyph >= glyphCount || depth > MAX_DEPTH) {
            return [];
        }
        const at = offset(glyph);
        const end = offset(glyph + 1);
        if (end <= at || at + 10 > glyf.byteLength) {
            return [];
        }
        const contours = glyf.getInt16(at);
        if (contours >= 0) {
            return simpleGlyph(glyf, at, contours);
        }

        // Built from other glyphs.
        const loops: TPoint[][] = [];
        let cursor = at + 10;
        let flags: number;
        do {
            flags = glyf.getUint16(cursor);
            const part = glyf.getUint16(cursor + 2);
            cursor += 4;
            let dx: number;
            let dy: number;
            // Bit 0: the two numbers take two bytes each.
            if ((flags & 1) !== 0) {
                dx = glyf.getInt16(cursor);
                dy = glyf.getInt16(cursor + 2);
                cursor += 4;
            } else {
                dx = glyf.getInt8(cursor);
                dy = glyf.getInt8(cursor + 1);
                cursor += 2;
            }
            // Bit 1 clear: the numbers are points to line up rather than a move. Rare enough to place
            // the part where it was drawn.
            if ((flags & 2) === 0) {
                dx = 0;
                dy = 0;
            }
            let a = 1;
            let b = 0;
            let c = 0;
            let d = 1;
            const f2dot14 = (): number => {
                const value = glyf.getInt16(cursor) / 16384;
                cursor += 2;
                return value;
            };
            if ((flags & 8) !== 0) {
                a = d = f2dot14();
            } else if ((flags & 0x40) !== 0) {
                a = f2dot14();
                d = f2dot14();
            } else if ((flags & 0x80) !== 0) {
                a = f2dot14();
                b = f2dot14();
                c = f2dot14();
                d = f2dot14();
            }
            for (const loop of points(part, depth + 1)) {
                loops.push(loop.map((point) => ({ x: a * point.x + c * point.y + dx, y: b * point.x + d * point.y + dy, on: point.on })));
            }
        } while ((flags & 0x20) !== 0 && cursor + 4 <= glyf.byteLength);
        return loops;
    };

    return (glyph) => {
        try {
            return points(glyph, 0).map(contourSegments).filter((loop) => loop.length > 0);
        } catch {
            return [];
        }
    };
};
