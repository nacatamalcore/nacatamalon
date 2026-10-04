import type { TColor } from '../../../color';
import type { TTexture } from '../../../loaders';
import type { TSpriteAtlas } from '../../../atlas';
import type { TPointerListener } from '../../../input';
import type { TSpriteMaterial, TUniformValues } from '../../../materials';
import type { TTransform2d } from '../../types/t_transform_2d';
import type { TNineSliceBorders, TNineSliceMode } from './t_nine_slice';

/**
 * What `createNineSlice` is asked for: a picture, how wide its borders are, and the size to draw it at.
 *
 * @category Game objects
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TNineSliceOptions = {
    /**
     * A texture from `useLoadTexture`. Wins over `key` and `atlas`.
     */
    texture?: TTexture;
    /**
     * The key a texture was loaded under.
     */
    key?: string;
    /**
     * A sheet from `createSpriteAtlas`, with `frame` saying which part of it is the picture.
     */
    atlas?: TSpriteAtlas;
    /**
     * Which frame of `atlas`, numbered from 0. Default `0`.
     */
    frame?: number;
    /**
     * Where the picture starts inside the texture, in 0-1, for a picture that is not a whole frame.
     */
    uvOffset?: { x: number; y: number };
    /**
     * How big the picture is inside the texture, in 0-1.
     */
    uvScale?: { x: number; y: number };
    /**
     * How wide each border is, in pixels of the picture: one number for all four, or each one. The
     * borders are the part that is never stretched, so they are usually the size of the corners as
     * drawn.
     */
    slice: number | TNineSliceBorders;
    /**
     * How the edges and the middle fill their space: `'stretch'` (the default), `'tile'` or
     * `'tile-fit'`, the same both ways or `{ x, y }` one per direction.
     */
    mode?: TNineSliceMode | { x: TNineSliceMode; y: TNineSliceMode };
    /**
     * How wide to draw it, in pixels. Required: drawn at the size of its picture it would cut nothing,
     * and a sprite already does that.
     */
    width: number;
    /**
     * How tall to draw it, in pixels.
     */
    height: number;
    /**
     * Where it is, how it is turned and how big. Only what is given: the rest is no turn and a scale
     * of 1, so `{ x, y }` is enough.
     */
    transform?: Partial<TTransform2d>;
    /**
     * Its colour, multiplied over the picture. Default white, the picture as drawn.
     */
    tint?: TColor;
    /**
     * Which point of it sits on `x`, `y`, in 0-1. Default its middle: `{ x: 0, y: 0 }` is its top-left corner.
     */
    anchor?: { x: number; y: number };
    /**
     * Draw order within its scene, as for a sprite.
     */
    zIndex?: number;
    /**
     * Crisp (`false`) or blended (`true`) when scaled. Default: the game's `smooth`.
     */
    smooth?: boolean;
    /**
     * Whether it is drawn. Default `true`.
     */
    visible?: boolean;
    /**
     * An effect of its own, from `createMaterial`. Omitted is the built-in shader.
     */
    material?: TSpriteMaterial;
    /**
     * Its own values for that material's knobs.
     */
    uniforms?: TUniformValues;
    /**
     * Called when the mouse or a finger comes over it. The whole rectangle counts.
     */
    onPointerOver?: TPointerListener;
    /**
     * Called when the pointer stops being over it, or leaves the game.
     */
    onPointerOut?: TPointerListener;
    /**
     * Called when the pointer moves while over it.
     */
    onPointerMove?: TPointerListener;
    /**
     * Called when a button is pressed, or a finger touches, over it.
     */
    onPointerDown?: TPointerListener;
    /**
     * Called when a button is released, or a finger lifts, over it.
     */
    onPointerUp?: TPointerListener;
    /**
     * Called when it is pressed and released without leaving it. The cursor turns into a hand over it.
     */
    onClick?: TPointerListener;
};
