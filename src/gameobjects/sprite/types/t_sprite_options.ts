import { type TColor } from "../../../color";
import type { TTransform2d } from "../../types/t_transform_2d";
import type { TTexture } from "../../../loaders";
import type { TSpriteAtlas } from "../../../atlas";
import type { TPointerListener } from "../../../input";

/**
 * What `createSprite` is asked for: a picture (`texture`, `key` or `atlas`), its size, where it
 * goes and how it looks. All of it is optional.
 *
 * @category Sprites
 * @since 1.0.0
 * @author Francisco Pereira Alvarado
 */
export type TSpriteOptions = {
    /**
     * An effect of its own, from `createMaterial`. Omitted is the built-in shader.
     */
    material?: TSpriteMaterial;
    /**
     * This sprite's own values for that material's knobs, laid over the material's own.
     */
    uniforms?: TUniformValues;

    /**
     * Omitted: the texture's width once it has loaded.
     */
    width?: number;
    /**
     * Omitted: the texture's height once it has loaded.
     */
    height?: number;
    /**
     * Where it is, how it is turned and how big. Only what is given: the rest is no turn and a scale
     * of 1, so `{ x, y }` is enough. Copied, so the object handed in stays the caller's.
     */
    transform?: Partial<TTransform2d>;
    /**
     * A texture from `useLoadTexture`. Wins over `key`.
     */
    texture?: TTexture;
    /**
     * The key a texture was loaded under, for a sprite built where the record is not at hand.
     */
    key?: string;
    tint?: TColor;
    /**
     * Which point of the sprite sits on its transform, in 0-1 of its own size: `{ x: 0.5, y: 0.5 }`
     * is its middle and the default, `{ x: 0.5, y: 1 }` the middle of its bottom edge (a character
     * standing on a floor), `{ x: 0, y: 0.5 }` its left edge (a bar that grows to the right).
     * Rotation and scale happen around it.
     */
    anchor?: { x: number; y: number };
    /**
     * A sheet from `createSpriteAtlas`. It supplies the image and, with `frame`, which part of it
     * to show. Anything given explicitly (`texture`, `uvOffset`, `uvScale`) wins over it.
     */
    atlas?: TSpriteAtlas;
    /**
     * Which frame of `atlas` to show, numbered from 0. Ignored without an atlas. Default `0`.
     */
    frame?: number;
    /**
     * Shows only part of the texture: where the window starts, in 0-1 across the image. Comes
     * with `uvScale`, and both together are how one image holds many frames.
     */
    uvOffset?: { x: number; y: number };
    /**
     * How big that window is, in 0-1: `{ x: 0.5, y: 1 }` is half the width, full height.
     */
    uvScale?: { x: number; y: number };
    /**
     * Shows the picture mirrored left to right, which is how one drawing covers a character facing
     * either way. It mirrors what is shown and not where it is: the sprite stays exactly where it
     * was, and so does the place it can be touched.
     */
    flipX?: boolean;
    /**
     * The same top to bottom.
     */
    flipY?: boolean;
    /**
     * Whether it is drawn. Default `true`. `false` makes it straight away hidden, which is how a
     * set of them is prepared in advance and shown one at a time.
     */
    visible?: boolean;
    /**
     * Overrides the game's `smooth` for this sprite alone: `false` keeps pixel art crisp when it
     * is scaled up, `true` blends between texels.
     */
    smooth?: boolean;
    /**
     * Which sprites it is drawn in front of, within its own scene: higher numbers go on top, and
     * negatives are allowed. Sprites with the same number keep the order they were created in.
     * Default `0`. It can be changed at any time and takes effect on the next frame drawn.
     */
    zIndex?: number;
    /**
     * Called when the mouse or a finger comes over this sprite. Only sprites with at least one of
     * these events count when deciding what is under the pointer, so a decoration on top does not
     * steal them.
     */
    onPointerOver?: TPointerListener;
    /**
     * Called when the pointer stops being over this sprite, or leaves the game.
     */
    onPointerOut?: TPointerListener;
    /**
     * Called when the pointer moves while over this sprite.
     */
    onPointerMove?: TPointerListener;
    /**
     * Called when a button is pressed, or a finger touches, over this sprite.
     */
    onPointerDown?: TPointerListener;
    /**
     * Called when a button is released, or a finger lifts, over this sprite.
     */
    onPointerUp?: TPointerListener;
    /**
     * Called when this sprite is pressed and released without leaving it: what a button does. Pressing
     * on it and releasing somewhere else does not count. The cursor turns into a hand over it.
     */
    onClick?: TPointerListener;
};

import type { TSpriteMaterial, TUniformValues } from '../../../materials';
