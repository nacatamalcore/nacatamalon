import { getColor } from '../../color';
import { trackDrawableOwner } from '../../box';
import { getActiveBox, getActiveGame } from '../../store';
import { createRecord } from '../create_record';
import { outsideSceneBody } from '../../utils/outside_scene_body';
import { describeColor, shapeColor } from './shape_color';
import type { TColorOption } from '../../color';
import type { TTransform2d } from '../types/t_transform_2d';
import type { TShape, TShapes } from './types/t_shapes';

/**
 * What `createShapes` is told.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TShapesOptions = {
    /**
     * What is drawn, in order, each filled first and then outlined. Can start empty and be filled in
     * later.
     */
    shapes?: TShape[];
    /**
     * Multiplies the colour of all of them. White by default.
     */
    tint?: TColorOption;
    transform?: Partial<TTransform2d>;
    zIndex?: number;
    visible?: boolean;
    parallax?: { x: number; y: number };
    name?: string;
};

/**
 * Puts shapes in the scene, drawn by the graphics card as they are each frame: rectangles, with
 * rounded corners or not, circles, ellipses and slices of them, outlines of any number of corners
 * (hollowed in too, a star or a letter), and lines as wide as asked for. Each is filled, outlined, or
 * both, in any colour, and they are all drawn together, in the order of the list.
 *
 * - `rect`: `x`, `y` (its top-left), `width`, `height`; `radius` rounds its corners (one, or one
 *   each from the top-left round), `rotation` turns it about its middle.
 * - `circle`: `x`, `y` (its middle), `radius`; with `start` and `end`, in radians clockwise from the
 *   right, a slice: filled, a pie (a cooldown); outlined, the arc alone (a ring that fills up).
 * - `ellipse`: as a circle, with `radiusX`, `radiusY` and `rotation`.
 * - `polygon`: `points`, three or more round it.
 * - `line`: `points`, two or more; `closed` joins the last to the first.
 * - `fill`: a colour. `stroke`: `{ width, color }`, with `join` (`'miter'`, `'round'`, `'bevel'`),
 *   `cap` for the ends of what is open (`'butt'`, `'round'`, `'square'`), and `align` for what is
 *   closed (`'center'`, `'inside'`, `'outside'`).
 *
 * They are plain data on what comes back, `shapes`: change a number (a bar's `width`, a slice's
 * `end`), push one, take one out, and the next frame draws it. Their places are measured from the
 * object's `transform`, which moves, turns and scales them all.
 *
 * Their edges are hard, as everything the engine draws, and widths are in the game's pixels, so they
 * grow with the camera's zoom. However many there are, the card draws them in one go: what they cost
 * is working their corners out again each frame.
 *
 * @example
 * ```ts
 * export const Level: TSceneFn = () => {
 *     let life = 1;
 *     let cooldown = 0;
 *     const hud = createShapes({
 *         transform: { x: 8, y: 8 },
 *         shapes: [
 *             { type: 'rect', x: 0, y: 0, width: 60, height: 6, radius: 2, fill: '#e15554' },
 *             { type: 'rect', x: 0, y: 0, width: 60, height: 6, radius: 2, stroke: { width: 1, color: '#ffffff', align: 'outside' } },
 *             { type: 'circle', x: 80, y: 3, radius: 6, start: -Math.PI / 2, end: -Math.PI / 2, fill: '#ffd23f' },
 *         ],
 *     });
 *     const bar = hud.shapes[0] as TShapeRect;
 *     const pie = hud.shapes[2] as TShapeCircle;
 *
 *     useUpdate((delta) => {
 *         cooldown = Math.min(1, cooldown + delta / 3);
 *         bar.width = 60 * life;
 *         pie.end = -Math.PI / 2 + cooldown * Math.PI * 2;
 *     });
 *     return createScene();
 * };
 * ```
 *
 * @param options - The shapes, their place and their look: see {@link TShapesOptions}.
 * @returns The shapes. Change `shapes` to change them; `destroy(shapes)` removes them.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export const createShapes = (options: TShapesOptions = {}): TShapes => {
    const box = getActiveBox();
    const store = getActiveGame();
    if (box === null || store === null) {
        throw outsideSceneBody('createShapes');
    }
    if (options.shapes !== undefined && !Array.isArray(options.shapes)) {
        throw new Error('[NacatamalOn] createShapes: `shapes` is a list. Give it `shapes: [{ type: \'rect\', x: 0, y: 0, width: 10, height: 10, fill: \'#ffffff\' }]`.');
    }
    // What it starts with is checked now, where the mistake is: a colour that is none would otherwise
    // only be said once the frame tries to draw it.
    (options.shapes ?? []).forEach((shape, at) => {
        const parts: Array<['fill' | 'stroke', unknown]> = [];
        if (shape !== null && typeof shape === 'object') {
            if (shape.type !== 'line' && shape.fill !== undefined && shape.fill !== null) {
                parts.push(['fill', shape.fill]);
            }
            // A stroke with no width is not drawn, so its colour is not asked for either.
            if (shape.stroke !== undefined && shape.stroke !== null && Number.isFinite(shape.stroke.width) && shape.stroke.width > 0) {
                parts.push(['stroke', shape.stroke.color]);
            }
        }
        for (const [part, color] of parts) {
            if (shapeColor(color) === null) {
                throw new Error(`[NacatamalOn] createShapes: the ${part} of shape ${at} is not a colour (${describeColor(color)}). Give it one getColor reads, such as '#ff6b1a'.`);
            }
        }
    });
    const shapes: TShapes = createRecord('shapes', {
        ...(options.name === undefined ? {} : { name: options.name }),
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...options.transform },
        // A list of its own, holding the shapes it was given: one kept in a constant and changed
        // later is still the one drawn.
        shapes: [...(options.shapes ?? [])],
        tint: getColor(options.tint ?? 'white'),
        zIndex: options.zIndex ?? 0,
        ...(options.visible === undefined ? {} : { visible: options.visible }),
        ...(options.parallax === undefined ? {} : { parallax: options.parallax }),
        destroyed: false,
    });

    box.drawables.push(shapes);
    trackDrawableOwner(shapes, box, store);
    return shapes;
};
