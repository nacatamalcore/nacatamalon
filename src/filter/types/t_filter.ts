import type { TBox } from '../../box/types/t_box';
import type { TPostEffect } from '../../post/types/t_post_effect';
import type { TPostProcessOptions } from '../../post/types/t_post_options';

/**
 * A rectangle in the space of the object a filter is on: where its own `x: 0, y: 0` is, turned and
 * grown with it.
 *
 * @category Filters
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFilterRect = { x: number; y: number; width: number; height: number };

/**
 * How a filter is made: `useFilter`'s options.
 *
 * @category Filters
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFilterOptions = {
    /**
     * The effects, in order, each reading what the one before it gave: the engine's own spread in
     * (`outline()`, `glow()`, `blur()`…), one written in place with a `fragment`, or a file from
     * `useLoadShader`, as `usePostProcess` takes them.
     */
    effects: readonly TPostProcessOptions[];
    /**
     * The part of the screen the effects work on, in the space of each object the filter is on: a
     * television's screen for a `crt()`. Left out, it is what the object draws, measured each frame,
     * with room around it for what the effects draw beyond it.
     */
    rect?: TFilterRect;
    /**
     * Pixels of room around what the object draws, for effects to draw into. Left out, each of the
     * engine's own effects says how much it needs (a glow its radius, a shadow how far it falls), and
     * the largest is taken. Ignored with a `rect`.
     */
    padding?: number;
    /**
     * Whether it filters at all. `true` by default; `false` draws the objects as they are for a while
     * without taking the filter away.
     */
    enabled?: boolean;
};

/**
 * A filter: effects run over what one object, and everything under it, draws, before it is laid on
 * the screen. A contour around a character made of pieces, a glow around a coin, a shadow under a
 * panel. Made with `useFilter`, it filters nothing until it is `add`ed to something; each object it
 * is added to is filtered on its own, and everything it says can be changed at any moment, for all
 * of them at once.
 *
 * @category Filters
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TFilter = {
    readonly type: 'filter';
    id: string;
    /**
     * The effects, in order. Their `uniforms` are read every frame, so writing a number into one
     * animates it on every object the filter is on.
     */
    readonly effects: TPostEffect[];
    /** The part of the screen the effects work on, in each object's space, or `null` for what it draws. */
    rect: TFilterRect | null;
    /** Pixels of room around what the object draws, or `null` for what the effects ask. */
    padding: number | null;
    enabled: boolean;
    /**
     * Filters this object and everything under it. An object has one filter: adding it to one that
     * had another takes that one's place. Filters inside each other each run on their own part.
     */
    add(box: TBox): void;
    /** Stops filtering this object. */
    remove(box: TBox): void;
    /** Whether it filters this object. */
    has(box: TBox): boolean;
    /** Every object it filters, in the order they were added. */
    readonly boxes: readonly TBox[];
};
