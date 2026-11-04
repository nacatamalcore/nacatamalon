import type { TColor, TColorOption } from '../../../color';
import type { TTransform2d } from '../../types/t_transform_2d';

/**
 * The line drawn along a shape's outline, or what a `line` is.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShapeStroke = {
    /**
     * How wide, in the game's pixels: it grows with the object's scale and the camera's zoom.
     */
    width: number;
    color: TColorOption;
    /**
     * How two sides meet: a sharp corner (`'miter'`, the default, cut flat when sharper than four
     * widths), a round one, or one cut flat (`'bevel'`).
     */
    join?: 'miter' | 'round' | 'bevel';
    /**
     * How an open line ends: flat at its last point (`'butt'`, the default), round, or flat half a
     * width past it (`'square'`). A closed outline has no ends.
     */
    cap?: 'butt' | 'round' | 'square';
    /**
     * Where a closed outline's line goes: on it (`'center'`, the default), all inside it, or all
     * outside it. A frame that has to keep within its box is `'inside'`.
     *
     * A see-through line is drawn once where its sides meet while they are long enough for its width;
     * one wider than the shape is narrow, or along sides shorter than it is wide, shows darker where
     * it overlaps itself.
     */
    align?: 'center' | 'inside' | 'outside';
};

/**
 * What every shape has.
 */
type TShapeCommon = {
    /**
     * Whether it is drawn. Omitted is drawn.
     */
    visible?: boolean;
};

/**
 * What a shape with an inside has: what fills it, and the line round it. Either, both, or neither
 * (then it is not seen).
 */
type TShapeFilled = TShapeCommon & {
    fill?: TColorOption | null;
    stroke?: TShapeStroke | null;
};

/**
 * A rectangle, by its top-left corner, with its corners rounded if `radius` says so.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShapeRect = TShapeFilled & {
    type: 'rect';
    x: number;
    y: number;
    width: number;
    height: number;
    /**
     * How round its corners are: one radius for all four, or one each, top-left, top-right,
     * bottom-right, bottom-left. Never more than half its shorter side.
     */
    radius?: number | [number, number, number, number];
    /**
     * Turned about its middle, in radians.
     */
    rotation?: number;
};

/**
 * A circle by its middle, or a slice of one from `start` to `end`: filled, a slice of a pie (a
 * cooldown); stroked, the arc alone (a ring that fills up).
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShapeCircle = TShapeFilled & {
    type: 'circle';
    x: number;
    y: number;
    radius: number;
    /**
     * Where the slice starts and ends, in radians clockwise from the right; an `end` before its
     * `start` goes round the other way. Both left out, or a whole turn or more apart, is the whole
     * circle.
     */
    start?: number;
    end?: number;
    /**
     * How many straight sides make it up. Left out, as many as keep it round at its size.
     */
    segments?: number;
};

/**
 * An ellipse by its middle, turned by `rotation`, or a slice of one, as a circle is.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShapeEllipse = TShapeFilled & {
    type: 'ellipse';
    x: number;
    y: number;
    radiusX: number;
    radiusY: number;
    rotation?: number;
    start?: number;
    end?: number;
    segments?: number;
};

/**
 * Any outline of three corners or more, one after another round it, hollowed in or not. One whose
 * sides cross is drawn from its middle out, folds showing.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShapePolygon = TShapeFilled & {
    type: 'polygon';
    points: Array<{ x: number; y: number }>;
};

/**
 * A line through two points or more, as wide as its `stroke` says; `closed` joins the last to the
 * first.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShapeLine = TShapeCommon & {
    type: 'line';
    points: Array<{ x: number; y: number }>;
    stroke: TShapeStroke;
    closed?: boolean;
};

/**
 * One of the shapes a `createShapes` draws.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShape = TShapeRect | TShapeCircle | TShapeEllipse | TShapePolygon | TShapeLine;

/**
 * Shapes drawn by the graphics card as they are each frame: rectangles, rounded or not, circles,
 * ellipses and slices of them, outlines of any number of corners, and lines as wide as asked for,
 * each filled, outlined or both, in any colour. A health bar and its frame, a cooldown, a ship drawn
 * in lines, a chart.
 *
 * They are plain data, `shapes`, drawn in the order of the list, each filled first and then
 * outlined: change a number, push one, take one out, and the next frame draws it. However many
 * there are, the card draws them in one go; what they cost is working out their corners again
 * each frame.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShapes = {
    readonly type: 'shapes';
    id: string;
    /**
     * A name to find it by.
     */
    name?: string;
    /**
     * Where it is, turned and scaled. The shapes are measured from here.
     */
    transform: TTransform2d;
    /**
     * Where it ends up once everything above it has moved it. Set by the engine every frame.
     */
    worldTransform?: TTransform2d;
    /**
     * What is drawn, in order. Change it at any time.
     */
    shapes: TShape[];
    /**
     * Multiplies the colour of all of them, `a` as opacity.
     */
    tint: TColor;
    /**
     * Draw order within the scene, as for any other drawing.
     */
    zIndex: number;
    /**
     * Whether it is drawn. Default `true`.
     */
    visible?: boolean;
    /**
     * How much it moves with the camera, as on a sprite.
     */
    parallax?: { x: number; y: number };
    destroyed: boolean;
};
