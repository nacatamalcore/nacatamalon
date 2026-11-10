import type { TPolygon } from '../../gameobjects/polygon';

/**
 * The shape a soft body starts as, measured from its object's place.
 *
 * - `'disk'`: a ring of `corners` round a circle, holding its area: a blob, a jelly, a ball of goo.
 * - `'polygon'`: a closed outline of the corners given, holding its area: any blob that is not round.
 * - `'rope'`: a line of `corners` from the object's place to `to`, which stretches and folds: a rope,
 *   a vine, a tail. It holds no area.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoftBodyShape2d =
    | { shape: 'disk'; radius: number; corners?: number }
    | { shape: 'polygon'; points: Array<{ x: number; y: number }> }
    | { shape: 'rope'; to: { x: number; y: number }; corners?: number };

/**
 * What a soft body is made of.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoftBodyOptions2d = TSoftBodyShape2d & {
    /**
     * How quickly it springs back into shape, in times a second: `5` by default, a jelly. Lower is
     * floppier (`2` sags), higher is firmer (`30` is a rubber ball).
     */
    softness?: number;
    /**
     * How soon its wobbling dies away: `1` by default, settling without bouncing back and forth;
     * `0.2` wobbles for a while.
     */
    damping?: number;
    /**
     * Holds on to the shape it started as, and not only to its area and its sides, so it squashes
     * and comes back. `true` by default for a closed body: a ring held only by its sides and its area
     * gives way under a weight, and one blob landing on another can fold it inside out. `false` lets
     * it slump into whatever it fell on, like goo. A rope has no shape to keep.
     */
    keepShape?: boolean;
    /**
     * How much it weighs in all, spread over its corners. `1` by default.
     */
    mass?: number;
    /**
     * How much it grips what it touches: `0.5` by default, `0` slides like ice, `1` rolls rather than
     * slides.
     */
    friction?: number;
    /**
     * How much it bounces off what it hits: `0` by default.
     */
    bounce?: number;
    /**
     * Corners held where they start: the ends of a rope, the corner of a flag on its pole. Counted
     * from `0`, as in `outline`.
     */
    pinned?: number[];
    /**
     * The shape that draws it: its corners are moved to the body's every frame, its picture stretching
     * with them. Made in the same object, with as many corners (`'disk'` and `'rope'` have `corners`,
     * 16 and 12 by default).
     */
    polygon?: TPolygon;
};

/**
 * A soft body in the scene's 2D world, as `useSoftBody2d` gives it: where its corners are, and ways to
 * move it.
 *
 * @category Physics
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSoftBody2d = {
    /**
     * Where each corner is now, measured from the object's place, which the body keeps at its middle.
     * Empty until the world has started.
     */
    readonly outline: ReadonlyArray<{ x: number; y: number }>;
    /**
     * How fast it is going as a whole, in pixels per second.
     */
    readonly velocity: { x: number; y: number };
    /**
     * Pushes every corner this frame, in pixels per second each second whatever it weighs, as gravity
     * does: asked every frame, a wind or a slope that leans; asked once, almost nothing.
     */
    push: (x: number, y: number) => void;
    /**
     * Adds to its speed at once, in pixels per second: a hop, a blow.
     */
    kick: (x: number, y: number) => void;
    /**
     * Takes it out of the world. Destroying its object does it too.
     */
    destroy: () => void;
};
