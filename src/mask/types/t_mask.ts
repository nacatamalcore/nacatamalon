import type { TBox } from '../../box/types/t_box';

/**
 * Which part of a shape's picture says where it lets things through: its `'alpha'` (what is
 * transparent cuts), or its `'luminance'` (white shows, black cuts), for a cut-out painted in black
 * and white.
 *
 * @category Masks
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaskChannel = 'alpha' | 'luminance';

/**
 * A rectangle in the space of the object it masks: where its own `x: 0, y: 0` is, turned and grown
 * with it.
 *
 * @category Masks
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaskRect = { x: number; y: number; width: number; height: number };

/**
 * How a mask is made: `useMask`'s options. A mask keeps things to a `rect`, or to the shape of
 * another object (`by`), one of the two.
 *
 * @category Masks
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMaskOptions = {
    /**
     * A rectangle to keep things to, in the space of each object the mask is added to. When it stays
     * square to the screen it costs nothing at all.
     */
    rect?: TMaskRect;
    /**
     * The object whose shape keeps things in: everything it draws, and everything under it, added
     * together. It is not drawn itself (see `showShape`), and it moves, turns, grows and is tweened
     * like any other object.
     */
    by?: TBox;
    /**
     * Which part of the shape's pictures says where it lets things through. `'alpha'` by default.
     */
    channel?: TMaskChannel;
    /**
     * `false`, the default, cuts hard: a pixel is in or out, at half way, which is what pixel art
     * wants. `true` lets the shape through as much as it is there, a soft edge or a fade, and is the
     * one kind of mask that costs a picture of its own.
     */
    soft?: boolean;
    /**
     * Draws only outside the shape instead of inside. `false` by default.
     */
    invert?: boolean;
    /**
     * Draws the shape as well as masking with it: a window's frame that also keeps in what is
     * inside. `false` by default.
     */
    showShape?: boolean;
    /**
     * Whether it masks at all. `true` by default; `false` lets everything through for a while
     * without taking the mask away.
     */
    enabled?: boolean;
};

/**
 * A mask: what keeps the objects it is added to, and everything under them, to a rectangle or to
 * the shape of another object. Made with `useMask`, it masks nothing until it is `add`ed to
 * something, and everything it says can be changed at any moment, for all of them at once.
 *
 * @category Masks
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TMask = {
    readonly type: 'mask';
    id: string;
    /** The rectangle it keeps to, or `null`. A shape (`by`) wins over it. */
    rect: TMaskRect | null;
    /** The object whose shape it keeps to, or `null`. */
    by: TBox | null;
    channel: TMaskChannel;
    soft: boolean;
    invert: boolean;
    showShape: boolean;
    enabled: boolean;
    /**
     * Masks this object and everything under it. An object has one mask: adding it to one that had
     * another takes that one's place. Masks inside each other keep to both.
     */
    add(box: TBox): void;
    /** Stops masking this object. */
    remove(box: TBox): void;
    /** Whether it masks this object. */
    has(box: TBox): boolean;
    /** Every object it masks, in the order they were added. */
    readonly boxes: readonly TBox[];
};
