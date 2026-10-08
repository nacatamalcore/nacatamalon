/**
 * One piece of a glyph's outline, in the font's units with y growing upwards: a straight line, or a
 * curve bent towards one control point.
 *
 * @internal
 */
export type TOutlineSegment =
    | { kind: 'line'; x0: number; y0: number; x1: number; y1: number }
    | { kind: 'quad'; x0: number; y0: number; cx: number; cy: number; x1: number; y1: number };

/**
 * A glyph's shape: closed loops of segments, each ending where the next begins and the last where the
 * first began. Outer loops run clockwise and holes the other way, as TrueType draws them.
 *
 * @internal
 */
export type TOutline = TOutlineSegment[][];
